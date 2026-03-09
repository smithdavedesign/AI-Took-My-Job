const navLinks = Array.from(document.querySelectorAll('.section-nav a'));
const sections = navLinks
  .map((link) => {
    const target = document.querySelector(link.getAttribute('href'));
    return target ? { link, target } : null;
  })
  .filter(Boolean);

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      const match = sections.find((section) => section.target === entry.target);
      if (!match) {
        return;
      }

      if (entry.isIntersecting) {
        navLinks.forEach((link) => link.classList.remove('is-active'));
        match.link.classList.add('is-active');
      }
    });
  },
  {
    rootMargin: '-35% 0px -45% 0px',
    threshold: 0.1
  }
);

sections.forEach((section) => observer.observe(section.target));

const copyButtons = Array.from(document.querySelectorAll('[data-copy-target]'));

copyButtons.forEach((button) => {
  button.addEventListener('click', async () => {
    const target = document.getElementById(button.dataset.copyTarget);
    if (!target) {
      return;
    }

    const originalLabel = button.textContent;

    try {
      await navigator.clipboard.writeText(target.innerText.trim());
      button.textContent = 'Copied';
    } catch {
      button.textContent = 'Copy failed';
    }

    window.setTimeout(() => {
      button.textContent = originalLabel;
    }, 1600);
  });
});