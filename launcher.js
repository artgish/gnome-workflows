import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';

import {filterWorkflows} from './workflows.js';

export const WorkflowDialog = GObject.registerClass(
class WorkflowDialog extends ModalDialog.ModalDialog {
    _init(extension) {
        super._init({styleClass: 'gnome-workflows-dialog', destroyOnClose: false});
        this._extension = extension;
        this._rows = [];
        this._selected = 0;

        this.contentLayout.add_child(new St.Label({
            text: 'gnome-workflows', style_class: 'gw-title',
        }));
        this.contentLayout.add_child(new St.Label({
            text: 'Choose a workflow to run', style_class: 'gw-subtitle',
        }));
        this._search = new St.Entry({
            hint_text: 'Search workflows…',
            primary_icon: new St.Icon({icon_name: 'system-search-symbolic', icon_size: 16}),
            can_focus: true,
            style_class: 'gw-search',
        });
        this.contentLayout.add_child(this._search);
        this._search.clutter_text.connect('text-changed', () => this.refresh());
        this._search.clutter_text.connect('key-press-event', (_actor, event) => {
            const key = event.get_key_symbol();
            if (key === Clutter.KEY_Down || key === Clutter.KEY_Up) {
                this._select(this._selected + (key === Clutter.KEY_Down ? 1 : -1));
                return Clutter.EVENT_STOP;
            }
            if (key === Clutter.KEY_Return || key === Clutter.KEY_KP_Enter) {
                const row = this._rows[this._selected];
                if (row && !row.running)
                    this._activate(row.workflow);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        this.setInitialKeyFocus(this._search.clutter_text);

        this._status = new St.Label({style_class: 'gw-status'});
        this._status.clutter_text.line_wrap = true;
        this.contentLayout.add_child(this._status);

        this._scroll = new St.ScrollView({
            style_class: 'gw-scroll', overlay_scrollbars: true, x_expand: true,
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
        });
        this._list = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL});
        this._scroll.set_child(this._list);
        this.contentLayout.add_child(this._scroll);

        const actions = new St.BoxLayout({style_class: 'gw-actions'});
        this.contentLayout.add_child(actions);
        this._action(actions, 'Edit YAML', () => {
            this.close();
            extension.editConfig();
        });
        this._action(actions, 'Logs', () => {
            this.close();
            extension.openLogs();
        });
        this._action(actions, 'Settings', () => {
            this.close();
            extension.openPreferences();
        });

        this.contentLayout.add_child(new St.Label({
            text: '↑ ↓ Select    Enter Run    Esc Close', style_class: 'gw-hint',
        }));
        this.setButtons([{label: 'Close', action: () => this.close(), key: Clutter.KEY_Escape}]);
    }

    _action(parent, label, action) {
        const button = new St.Button({
            label, style_class: 'button gw-action', can_focus: true,
        });
        button.connect('clicked', action);
        parent.add_child(button);
    }

    present() {
        this._search.set_text('');
        this.refresh();
        this.open();
    }

    refresh() {
        if (!this._list)
            return;
        const store = this._extension.store;
        const runner = this._extension.runner;
        const filtered = filterWorkflows(store?.workflows ?? [], this._search.get_text());
        this._list.destroy_all_children();
        this._rows = [];
        this._selected = 0;

        if (store?.error) {
            this._status.text = `Cannot load workflows: ${store.error}`;
            this._status.add_style_class_name('gw-error');
        } else {
            this._status.text = `${filtered.length} workflow${filtered.length === 1 ? '' : 's'} · ${store?.path ?? ''}`;
            this._status.remove_style_class_name('gw-error');
        }

        for (const workflow of filtered) {
            const running = runner.running.has(workflow.id);
            const button = new St.Button({
                style_class: 'gw-workflow', can_focus: true,
                x_expand: true, accessible_name: workflow.name,
            });
            const layout = new St.BoxLayout({style_class: 'gw-row', x_expand: true});
            layout.add_child(new St.Icon({
                icon_name: workflow.icon, style_class: 'gw-icon', y_align: Clutter.ActorAlign.CENTER,
            }));
            const details = new St.BoxLayout({
                orientation: Clutter.Orientation.VERTICAL, x_expand: true,
                y_align: Clutter.ActorAlign.CENTER, style_class: 'gw-details',
            });
            const title = new St.Label({text: workflow.name, style_class: 'gw-name'});
            details.add_child(title);
            const subtitle = workflow.description || workflow.commands.join(' · ');
            details.add_child(new St.Label({
                text: subtitle.replace(/\s+/g, ' '), style_class: 'gw-description',
            }));
            layout.add_child(details);
            layout.add_child(new St.Label({
                text: running ? 'Running…' : 'Run',
                y_align: Clutter.ActorAlign.CENTER, style_class: 'gw-run-label',
            }));
            button.set_child(layout);
            const index = this._rows.length;
            button.connect('clicked', () => {
                if (!running)
                    this._activate(workflow);
            });
            button.connect('key-focus-in', () => this._select(index));
            this._rows.push({button, workflow, running});
            this._list.add_child(button);
        }
        if (filtered.length === 0) {
            this._list.add_child(new St.Label({
                text: store?.error ? 'Edit the YAML file to fix the error.'
                    : store?.workflows.length ? 'No matching workflows.'
                        : 'No workflows yet. Add one with Edit YAML.',
                style_class: 'gw-empty',
            }));
        }
        this._select(0);
    }

    _select(index) {
        if (!this._rows.length)
            return;
        this._rows[this._selected]?.button.remove_style_pseudo_class('selected');
        this._selected = Math.max(0, Math.min(index, this._rows.length - 1));
        const button = this._rows[this._selected].button;
        button.add_style_pseudo_class('selected');
        const adjustment = this._scroll.vadjustment;
        const [, top] = button.get_position();
        const bottom = top + button.height;
        if (top < adjustment.value)
            adjustment.value = top;
        else if (bottom > adjustment.value + adjustment.page_size)
            adjustment.value = bottom - adjustment.page_size;
    }

    _activate(workflow) {
        this.close();
        this._extension.runWorkflow(workflow);
    }
});
