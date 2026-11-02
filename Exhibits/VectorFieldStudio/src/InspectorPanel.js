/*====================================================================================================================================
                                                        INSPECTORPANEL.JS
====================================================================================================================================*/
// 🧩 Schema-driven inspector with live readouts, charts, source membership, and probe sampling.

import { icon } from './IconAtlas.js';
import { getSchema } from './ParameterSchema.js';
import { drawHistogram, drawProfile, drawVectorDial } from './ChartStrip.js';
import { PRESETS } from './SceneState.js';

let controlSequence = 0;

function formatValue(value, control) {
    if (value === undefined || value === null) return '—';
    if (typeof value === 'boolean') return value ? 'On' : 'Off';
    if (Array.isArray(value)) return value.map((entry) => Number(entry).toFixed(2)).join(', ');
    if (typeof value === 'number') {
        if (control.unit === '%') return `${(value * 100).toFixed(1)}%`;
        if (control.unit === '×') return `${value.toFixed(2)}×`;
        if (control.unit === '°') return `${value.toFixed(0)}°`;
        if (control.unit === 'm/s') return `${value.toFixed(1)} m/s`;
        if (control.unit === 'm') return `${value.toFixed(1)} m`;
        if (control.unit === 's') return `${value.toFixed(1)} s`;
        if (control.unit === 'px') return `${value.toFixed(1)} px`;
        if (control.unit === 'u') return `${value.toFixed(2)} u`;
        if (control.digits !== undefined) return value.toFixed(control.digits);
        return Number.isInteger(value) ? String(value) : value.toFixed(2);
    }
    return String(value);
}

export class InspectorPanel {
    constructor(container, state, callbacks = {}) {
        this.container = container;
        this.state = state;
        this.callbacks = callbacks;
        this.dynamic = new Map();
        this.charts = [];
        this.analysis = {};
        this.info = {};
        this.probe = null;
        this.collapsed = new Set();
    }

    kindForSelection() {
        const selected = this.state.selected;
        if (selected && this.state.layers.force.sources.some((source) => source.id === selected)) return 'forceSource';
        if (selected === 'scene') return 'scene';
        if (selected === 'terrainFlow') return 'terrainFlow';
        if (selected === 'precipitation') return 'precipitation';
        if (selected === 'vegetation') return 'vegetation';
        if (selected === 'slice') return 'slice';
        if (selected === 'glyphs') return 'glyphs';
        if (selected === 'streamlines') return 'streamlines';
        if (selected === 'grid') return 'grid';
        if (selected === 'probe') return 'probe';
        if (selected === 'wind' || selected === 'force' || selected === 'terrain') return selected;
        return 'scene';
    }

    getByPath(path) {
        if (path.startsWith('analysis.')) return this.analysis[path.slice(9)];
        if (path.startsWith('info.')) return this.info[path.slice(5)];
        const parts = path.split('.');
        let value = this.state;
        for (const part of parts) {
            if (value === null || value === undefined) return undefined;
            value = value[Number.isInteger(Number(part)) ? Number(part) : part];
        }
        return value;
    }

    setByPath(path, value) {
        if (path.startsWith('analysis.') || path.startsWith('info.')) return;
        const parts = path.split('.');
        let target = this.state;
        for (let i = 0; i < parts.length - 1; i++) {
            const key = Number.isInteger(Number(parts[i])) ? Number(parts[i]) : parts[i];
            if (target[key] === undefined) target[key] = {};
            target = target[key];
        }
        const last = Number.isInteger(Number(parts[parts.length - 1])) ? Number(parts[parts.length - 1]) : parts[parts.length - 1];
        target[last] = value;
    }

    setAnalysis(analysis) {
        this.analysis = analysis || {};
        this.refreshDynamic();
    }

    setInfo(info) {
        this.info = info || {};
        this.refreshDynamic();
    }

    setProbeData(probe) {
        this.probe = probe;
        this.refreshDynamic();
    }

    createSection(title, controls) {
        const section = document.createElement('section');
        section.className = 'inspector-section';
        const header = document.createElement('button');
        header.className = 'section-header';
        header.type = 'button';
        header.innerHTML = `<span>${title}</span>${icon(this.collapsed.has(title) ? 'chevron' : 'chevronDown', 12)}`;
        const body = document.createElement('div');
        body.className = 'section-body';
        if (this.collapsed.has(title)) body.classList.add('collapsed');
        header.addEventListener('click', () => {
            if (this.collapsed.has(title)) this.collapsed.delete(title);
            else this.collapsed.add(title);
            body.classList.toggle('collapsed');
            header.innerHTML = `<span>${title}</span>${icon(this.collapsed.has(title) ? 'chevron' : 'chevronDown', 12)}`;
        });
        section.appendChild(header);
        section.appendChild(body);
        for (const control of controls) {
            const element = this.createControl(control);
            if (element) body.appendChild(element);
        }
        return section;
    }

    createControl(control) {
        const value = control.path ? this.getByPath(control.path) : undefined;
        if (control.type === 'slider') {
            const wrapper = document.createElement('div');
            wrapper.className = 'control slider-control';
            const id = `slider-${controlSequence++}`;
            const header = document.createElement('div');
            header.className = 'control-head';
            const label = document.createElement('label');
            label.htmlFor = id;
            label.textContent = control.label;
            const display = document.createElement('span');
            display.className = 'control-value';
            display.textContent = formatValue(value, control);
            header.appendChild(label);
            header.appendChild(display);
            const input = document.createElement('input');
            input.type = 'range';
            input.id = id;
            input.min = String(control.min);
            input.max = String(control.max);
            input.step = String(control.step);
            input.value = String(value);
            input.addEventListener('input', () => {
                const next = Number(input.value);
                display.textContent = formatValue(next, control);
                this.setByPath(control.path, next);
                this.callbacks.onChange?.(control.path, next);
            });
            wrapper.appendChild(header);
            wrapper.appendChild(input);
            return wrapper;
        }
        if (control.type === 'toggle') {
            const wrapper = document.createElement('div');
            wrapper.className = 'control toggle-control';
            const label = document.createElement('span');
            label.textContent = control.label;
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'switch';
            button.setAttribute('role', 'switch');
            button.setAttribute('aria-checked', value ? 'true' : 'false');
            button.innerHTML = '<span class="switch-knob"></span>';
            button.addEventListener('click', () => {
                const next = !this.getByPath(control.path);
                this.setByPath(control.path, next);
                button.setAttribute('aria-checked', next ? 'true' : 'false');
                this.callbacks.onChange?.(control.path, next);
            });
            wrapper.appendChild(label);
            wrapper.appendChild(button);
            return wrapper;
        }
        if (control.type === 'select') {
            const wrapper = document.createElement('div');
            wrapper.className = 'control select-control';
            const label = document.createElement('label');
            label.textContent = control.label;
            const select = document.createElement('select');
            for (const option of control.options) {
                const entry = document.createElement('option');
                entry.value = option.value;
                entry.textContent = option.label;
                if (option.value === value) entry.selected = true;
                select.appendChild(entry);
            }
            select.addEventListener('change', () => {
                this.setByPath(control.path, select.value);
                this.callbacks.onChange?.(control.path, select.value);
            });
            wrapper.appendChild(label);
            wrapper.appendChild(select);
            return wrapper;
        }
        if (control.type === 'color') {
            const wrapper = document.createElement('div');
            wrapper.className = 'control color-control';
            const label = document.createElement('label');
            label.textContent = control.label;
            const input = document.createElement('input');
            input.type = 'color';
            input.value = value;
            const text = document.createElement('span');
            text.className = 'color-hex';
            text.textContent = value;
            input.addEventListener('input', () => {
                text.textContent = input.value;
                this.setByPath(control.path, input.value);
                this.callbacks.onChange?.(control.path, input.value);
            });
            wrapper.appendChild(label);
            const row = document.createElement('div');
            row.className = 'color-row';
            row.appendChild(input);
            row.appendChild(text);
            wrapper.appendChild(row);
            return wrapper;
        }
        if (control.type === 'vector3') {
            const wrapper = document.createElement('div');
            wrapper.className = 'control vector-control';
            const label = document.createElement('span');
            label.textContent = control.label;
            const row = document.createElement('div');
            row.className = 'vector-row';
            const values = Array.isArray(value) ? value : [0, 0, 0];
            ['X', 'Y', 'Z'].forEach((axis, index) => {
                const field = document.createElement('label');
                field.className = 'vector-field';
                field.textContent = axis;
                const input = document.createElement('input');
                input.type = 'number';
                input.step = String(control.step || 0.1);
                input.value = String(values[index] ?? 0);
                input.addEventListener('change', () => {
                    const next = [...(this.getByPath(control.path) || [0, 0, 0])];
                    next[index] = Number(input.value);
                    this.setByPath(control.path, next);
                    this.callbacks.onChange?.(control.path, next);
                });
                field.appendChild(input);
                row.appendChild(field);
            });
            wrapper.appendChild(label);
            wrapper.appendChild(row);
            return wrapper;
        }
        if (control.type === 'button') {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `action-button${control.danger ? ' danger' : ''}`;
            button.innerHTML = `${icon(control.icon || 'bolt', 13)}<span>${control.label}</span>`;
            button.addEventListener('click', () => this.callbacks.onAction?.(control.action));
            return button;
        }
        if (control.type === 'readout') {
            const row = document.createElement('div');
            row.className = 'readout';
            const label = document.createElement('span');
            label.textContent = control.label;
            const valueElement = document.createElement('span');
            valueElement.className = 'readout-value';
            valueElement.textContent = formatValue(value, control);
            row.appendChild(label);
            row.appendChild(valueElement);
            this.dynamic.set(control.path, { element: valueElement, control });
            return row;
        }
        if (control.type === 'note') {
            const note = document.createElement('p');
            note.className = 'note';
            note.textContent = control.text;
            return note;
        }
        if (control.type === 'sources') {
            const wrapper = document.createElement('div');
            wrapper.className = 'source-list';
            const sources = this.state.layers.force.sources;
            sources.forEach((source) => {
                const row = document.createElement('div');
                row.className = `source-row${this.state.selected === source.id ? ' selected' : ''}`;
                const dot = document.createElement('span');
                dot.className = 'source-dot';
                dot.style.background = source.kind === 'vortex' ? '#8f7ad9' : source.kind === 'repulsor' ? '#c96a6a' : '#d9a06a';
                const label = document.createElement('span');
                label.className = 'source-label';
                label.textContent = source.label;
                const kind = document.createElement('span');
                kind.className = 'source-kind';
                kind.textContent = source.kind;
                const toggle = document.createElement('button');
                toggle.type = 'button';
                toggle.className = 'source-toggle';
                toggle.innerHTML = icon(source.enabled !== false ? 'eye' : 'eyeOff', 12);
                toggle.addEventListener('click', (event) => {
                    event.stopPropagation();
                    source.enabled = source.enabled === false;
                    this.callbacks.onChange?.('layers.force.sources', this.state.layers.force.sources);
                    this.render();
                });
                row.appendChild(dot);
                row.appendChild(label);
                row.appendChild(kind);
                row.appendChild(toggle);
                row.addEventListener('click', () => {
                    this.state.selected = source.id;
                    this.callbacks.onSelect?.(source.id);
                    this.render();
                });
                wrapper.appendChild(row);
            });
            const add = document.createElement('button');
            add.type = 'button';
            add.className = 'action-button source-add';
            add.innerHTML = `${icon('plus', 13)}<span>Add source</span>`;
            add.addEventListener('click', () => this.callbacks.onAction?.('add-source'));
            wrapper.appendChild(add);
            return wrapper;
        }
        if (control.type === 'probe') {
            const wrapper = document.createElement('div');
            wrapper.className = 'probe-block';
            const hasProbe = this.probe && this.probe.valid;
            if (!hasProbe) {
                const note = document.createElement('p');
                note.className = 'note';
                note.textContent = 'No probe placed. Enable the probe tool and click the terrain surface.';
                wrapper.appendChild(note);
                return wrapper;
            }
            const top = document.createElement('div');
            top.className = 'probe-top';
            const canvas = document.createElement('canvas');
            canvas.className = 'probe-dial';
            canvas.width = 96;
            canvas.height = 96;
            drawVectorDial(canvas, this.probe.vector);
            const values = document.createElement('div');
            values.className = 'probe-values';
            const entries = [
                ['Position', this.probe.position.map((entry) => entry.toFixed(1)).join(', ')],
                ['Vector', this.probe.vector.map((entry) => entry.toFixed(2)).join(', ')],
                ['Magnitude', `${this.probe.magnitude.toFixed(2)} u`],
                ['Potential', this.probe.potential.toFixed(3)],
                ['Ground', `${this.probe.ground.toFixed(1)} m`],
                ['Flow', this.probe.flow.toFixed(2)],
                ['Vegetation', this.probe.vegetation.toFixed(2)],
                ['Moisture', this.probe.moisture.toFixed(2)],
            ];
            for (const [label, value] of entries) {
                const row = document.createElement('div');
                row.className = 'readout';
                const key = document.createElement('span');
                key.textContent = label;
                const valueElement = document.createElement('span');
                valueElement.className = 'readout-value';
                valueElement.textContent = value;
                row.appendChild(key);
                row.appendChild(valueElement);
                values.appendChild(row);
            }
            top.appendChild(canvas);
            top.appendChild(values);
            wrapper.appendChild(top);
            const clear = document.createElement('button');
            clear.type = 'button';
            clear.className = 'action-button';
            clear.innerHTML = `${icon('close', 13)}<span>Clear probe</span>`;
            clear.addEventListener('click', () => this.callbacks.onAction?.('clear-probe'));
            wrapper.appendChild(clear);
            return wrapper;
        }
        if (control.type === 'histogram') {
            const wrapper = document.createElement('div');
            wrapper.className = 'chart-block';
            const canvas = document.createElement('canvas');
            canvas.className = 'chart-canvas';
            wrapper.appendChild(canvas);
            this.charts.push({ type: 'histogram', canvas });
            return wrapper;
        }
        if (control.type === 'profile') {
            const wrapper = document.createElement('div');
            wrapper.className = 'chart-block';
            const canvas = document.createElement('canvas');
            canvas.className = 'chart-canvas profile';
            wrapper.appendChild(canvas);
            this.charts.push({ type: 'profile', canvas });
            return wrapper;
        }
        if (control.type === 'presets') {
            const wrapper = document.createElement('div');
            wrapper.className = 'preset-grid';
            for (const preset of PRESETS) {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'preset-button';
                button.innerHTML = `<span class="preset-title">${preset.label}</span><span class="preset-description">${preset.description}</span>`;
                button.addEventListener('click', () => this.callbacks.onPreset?.(preset.id));
                wrapper.appendChild(button);
            }
            return wrapper;
        }
        return null;
    }

    render() {
        const scroll = this.container.scrollTop;
        this.container.innerHTML = '';
        this.dynamic.clear();
        this.charts = [];
        const kind = this.kindForSelection();
        const schema = getSchema(kind, this.state);
        for (const section of schema) {
            this.container.appendChild(this.createSection(section.title, section.controls));
        }
        this.container.scrollTop = scroll;
        this.refreshDynamic();
    }

    refreshDynamic() {
        for (const [path, entry] of this.dynamic) {
            const value = this.getByPath(path);
            entry.element.textContent = formatValue(value, entry.control);
        }
        for (const chart of this.charts) {
            if (chart.type === 'histogram') {
                drawHistogram(chart.canvas, this.analysis.statistics, { accent: this.analysis.accent || '#a9bd9c' });
            } else if (chart.type === 'profile') {
                drawProfile(chart.canvas, this.analysis.profile, { accent: this.analysis.accent || '#7fc8b0' });
            }
        }
        if (this.probe && this.probe.valid) {
            const probeBlock = this.container.querySelector('.probe-block');
            if (probeBlock) {
                const canvas = probeBlock.querySelector('.probe-dial');
                if (canvas) drawVectorDial(canvas, this.probe.vector);
            }
        }
    }
}
