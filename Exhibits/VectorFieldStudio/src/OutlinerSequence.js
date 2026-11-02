/*====================================================================================================================================
                                                        OUTLINERSEQUENCE.JS
====================================================================================================================================*/
// 🧩 Scene outliner: layer tree, visibility, selection, and field-source membership.

import { icon } from './IconAtlas.js';

export class OutlinerSequence {
    constructor(container, state, callbacks = {}) {
        this.container = container;
        this.state = state;
        this.callbacks = callbacks;
        this.expanded = new Set(['scene', 'force']);
        this.filter = '';
        this.searchInput = null;
    }

    attachSearch(input) {
        this.searchInput = input;
        input.addEventListener('input', () => {
            this.filter = input.value.trim().toLowerCase();
            this.render();
        });
    }

    tree() {
        const state = this.state;
        const forceSources = state.layers.force.sources.map((source, index) => ({
            id: source.id,
            label: source.label,
            kind: 'forceSource',
            icon: source.kind === 'vortex' ? 'rotate' : source.kind === 'repulsor' ? 'target' : 'force',
            color: source.kind === 'vortex' ? '#8f7ad9' : source.kind === 'repulsor' ? '#c96a6a' : '#d9a06a',
            visible: source.enabled !== false,
            index,
        }));
        return [{
            id: 'scene',
            label: 'Frontier Field',
            kind: 'scene',
            icon: 'layers',
            color: '#a9bd9c',
            visible: true,
            children: [
                {
                    id: 'terrain',
                    label: 'Terrain',
                    kind: 'terrain',
                    icon: 'terrain',
                    color: '#a9bd9c',
                    visible: state.layers.terrain.visible,
                },
                {
                    id: 'wind',
                    label: 'Wind Field',
                    kind: 'wind',
                    icon: 'wind',
                    color: '#7fc8b0',
                    visible: state.layers.wind.visible,
                    active: state.mode === 'wind',
                    field: true,
                },
                {
                    id: 'force',
                    label: 'Force Field',
                    kind: 'force',
                    icon: 'force',
                    color: '#d9a06a',
                    visible: state.layers.force.visible,
                    active: state.mode === 'force',
                    field: true,
                    children: forceSources,
                },
                {
                    id: 'terrainFlow',
                    label: 'Terrain Flow',
                    kind: 'terrainFlow',
                    icon: 'waves',
                    color: '#8fc7cf',
                    visible: state.layers.terrainFlow.visible,
                    active: state.mode === 'terrain',
                    field: true,
                },
                {
                    id: 'precipitation',
                    label: 'Precipitation',
                    kind: 'precipitation',
                    icon: 'rain',
                    color: '#9fc6d8',
                    visible: state.layers.precipitation.visible,
                },
                {
                    id: 'vegetation',
                    label: 'Vegetation',
                    kind: 'vegetation',
                    icon: 'vegetation',
                    color: '#7fa86a',
                    visible: state.layers.vegetation.visible,
                },
                {
                    id: 'slice',
                    label: 'Slice Plane',
                    kind: 'slice',
                    icon: 'slice',
                    color: '#c8b98a',
                    visible: state.layers.slice.visible,
                },
                {
                    id: 'glyphs',
                    label: 'Field Glyphs',
                    kind: 'glyphs',
                    icon: 'glyph',
                    color: '#b9c98a',
                    visible: state.layers.glyphs.visible,
                },
                {
                    id: 'streamlines',
                    label: 'Streamlines',
                    kind: 'streamlines',
                    icon: 'streamline',
                    color: '#c9a06a',
                    visible: state.layers.streamlines.visible,
                },
                {
                    id: 'grid',
                    label: 'Ground Grid',
                    kind: 'grid',
                    icon: 'grid',
                    color: '#7f877d',
                    visible: state.layers.grid.visible,
                },
                {
                    id: 'probe',
                    label: 'Probe',
                    kind: 'probe',
                    icon: 'probe',
                    color: '#e8f0d8',
                    visible: state.layers.probe.active,
                },
            ],
        }];
    }

    matches(node) {
        if (!this.filter) return true;
        if (node.label.toLowerCase().includes(this.filter)) return true;
        return Boolean(node.children && node.children.some((child) => this.matches(child)));
    }

    visibleState(node) {
        if (node.kind === 'forceSource') {
            const source = this.state.layers.force.sources.find((entry) => entry.id === node.id);
            return source ? source.enabled !== false : true;
        }
        if (node.kind === 'probe') return this.state.layers.probe.active;
        if (node.kind === 'scene') return true;
        if (node.kind === 'wind') return this.state.layers.wind.visible;
        if (node.kind === 'force') return this.state.layers.force.visible;
        if (node.kind === 'terrainFlow') return this.state.layers.terrainFlow.visible;
        if (node.kind === 'terrain') return this.state.layers.terrain.visible;
        if (node.kind === 'precipitation') return this.state.layers.precipitation.visible;
        if (node.kind === 'vegetation') return this.state.layers.vegetation.visible;
        if (node.kind === 'slice') return this.state.layers.slice.visible;
        if (node.kind === 'glyphs') return this.state.layers.glyphs.visible;
        if (node.kind === 'streamlines') return this.state.layers.streamlines.visible;
        if (node.kind === 'grid') return this.state.layers.grid.visible;
        return true;
    }

    buildNode(node, depth) {
        if (!this.matches(node)) return null;
        const row = document.createElement('div');
        row.className = 'tree-row';
        row.style.setProperty('--depth', String(depth));
        row.dataset.id = node.id;
        if (this.state.selected === node.id) row.classList.add('selected');
        if (node.active) row.classList.add('active');
        if (node.field && !node.active) row.classList.add('inactive');
        if (!this.visibleState(node)) row.classList.add('muted');
        row.setAttribute('role', 'treeitem');
        row.setAttribute('tabindex', '0');
        row.setAttribute('aria-selected', this.state.selected === node.id ? 'true' : 'false');

        const hasChildren = Boolean(node.children && node.children.length);
        if (hasChildren) {
            const disclosure = document.createElement('button');
            disclosure.className = 'tree-disclosure';
            disclosure.setAttribute('aria-label', this.expanded.has(node.id) ? 'Collapse' : 'Expand');
            disclosure.innerHTML = icon(this.expanded.has(node.id) ? 'chevronDown' : 'chevron', 12);
            disclosure.addEventListener('click', (event) => {
                event.stopPropagation();
                if (this.expanded.has(node.id)) this.expanded.delete(node.id);
                else this.expanded.add(node.id);
                this.render();
            });
            row.appendChild(disclosure);
        } else {
            const spacer = document.createElement('span');
            spacer.className = 'tree-spacer';
            row.appendChild(spacer);
        }

        const iconWrap = document.createElement('span');
        iconWrap.className = 'tree-icon';
        iconWrap.style.color = node.color || '#a9bd9c';
        iconWrap.innerHTML = icon(node.icon || 'info', 14);
        row.appendChild(iconWrap);

        const label = document.createElement('span');
        label.className = 'tree-label';
        label.textContent = node.label;
        row.appendChild(label);

        if (node.active) {
            const badge = document.createElement('span');
            badge.className = 'tree-badge';
            badge.textContent = 'ACTIVE';
            row.appendChild(badge);
        }

        const toggle = document.createElement('button');
        toggle.className = 'tree-toggle';
        toggle.setAttribute('aria-label', this.visibleState(node) ? 'Hide layer' : 'Show layer');
        toggle.innerHTML = icon(this.visibleState(node) ? 'eye' : 'eyeOff', 13);
        toggle.addEventListener('click', (event) => {
            event.stopPropagation();
            const visible = !this.visibleState(node);
            this.callbacks.onToggleVisibility?.(node.id, visible);
        });
        row.appendChild(toggle);

        row.addEventListener('click', () => this.callbacks.onSelect?.(node.id));
        row.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                this.callbacks.onSelect?.(node.id);
            }
            if (event.key === 'ArrowRight' && hasChildren) {
                this.expanded.add(node.id);
                this.render();
            }
            if (event.key === 'ArrowLeft' && hasChildren) {
                this.expanded.delete(node.id);
                this.render();
            }
        });

        const fragment = document.createDocumentFragment();
        fragment.appendChild(row);
        if (hasChildren && this.expanded.has(node.id)) {
            const children = document.createElement('div');
            children.className = 'tree-children';
            children.setAttribute('role', 'group');
            for (const child of node.children) {
                const childRow = this.buildNode(child, depth + 1);
                if (childRow) children.appendChild(childRow);
            }
            fragment.appendChild(children);
        }
        return fragment;
    }

    render() {
        const scroll = this.container.scrollTop;
        this.container.innerHTML = '';
        const tree = document.createElement('div');
        tree.className = 'tree';
        tree.setAttribute('role', 'tree');
        for (const node of this.tree()) {
            const fragment = this.buildNode(node, 0);
            if (fragment) tree.appendChild(fragment);
        }
        this.container.appendChild(tree);
        this.container.scrollTop = scroll;
        const count = this.container.querySelectorAll('.tree-row').length;
        const footer = document.querySelector('[data-outliner-count]');
        if (footer) footer.textContent = `${count} ${count === 1 ? 'entry' : 'entries'}`;
    }
}
