export function escapeMarkup(text) {
  return String(text).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char]));
}

export function propertyField(label, property, current, inputType = 'text', suffix = '') {
  return `<div class="field"><label>${label}</label><input data-property="${property}" type="${inputType}" value="${escapeMarkup(current)}" />${suffix ? `<small>${suffix}</small>` : ''}</div>`;
}

export function slideInspector(track, tab) {
  if (track) track.style.transform = tab === 'properties' ? 'translateX(-50%)' : 'translateX(0)';
}

export function bindInspectorTabs(buttons, track, onChange) {
  buttons.forEach(button => button.addEventListener('click', () => {
    const tab = button.dataset.inspector;
    buttons.forEach(item => item.classList.toggle('is-active', item.dataset.inspector === tab));
    slideInspector(track, tab);
    if (onChange) onChange(tab);
  }));
}
