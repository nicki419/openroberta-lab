const img = document.querySelector('img[src="/css/img/system_preview/edisonv2.jpg"]');
img.scrollIntoView({ block: 'center' });
await new Promise((r) => setTimeout(r, 500));
const r = img.getBoundingClientRect();
return Math.round(r.x + r.width / 2) + ' ' + Math.round(r.y + r.height / 2);
