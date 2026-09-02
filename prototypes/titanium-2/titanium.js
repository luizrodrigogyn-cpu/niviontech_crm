const labels = { dashboard: 'Dashboard', pipeline: 'Pipeline', client: 'Cliente 360°', orbit: 'Orbit IA' };
const viewButtons = document.querySelectorAll('[data-view]');
const views = document.querySelectorAll('.view');

function showView(id) {
  views.forEach((view) => view.classList.toggle('active', view.id === id));
  viewButtons.forEach((button) => button.classList.toggle('active', button.dataset.view === id));
  document.querySelector('#currentPage').textContent = labels[id];
  document.querySelector('.sidebar').classList.remove('open');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  history.replaceState(null, '', `#${id}`);
}

viewButtons.forEach((button) => button.addEventListener('click', (event) => {
  event.preventDefault();
  showView(button.dataset.view);
}));

document.querySelector('.mobile-menu').addEventListener('click', () => document.querySelector('.sidebar').classList.toggle('open'));
document.querySelector('#hidePrototype').addEventListener('click', () => document.querySelector('.prototype-bar').classList.add('hidden'));

const initialView = location.hash.slice(1);
if (labels[initialView]) showView(initialView);
