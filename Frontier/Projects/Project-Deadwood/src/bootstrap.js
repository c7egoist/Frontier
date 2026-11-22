// Each study has its own runtime; the glacier never builds the old garden assets.
const world=new URLSearchParams(location.search).get('world');
if(world==='deadwood'||world==='garden')import('./main.js');else if(world==='glacier')import('./glacier-main.js');else import('./web-main.js');
