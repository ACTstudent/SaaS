/* Templates, design presets, sample content and the resume renderer. */
(function (root) {
  'use strict';

  const TEMPLATES = [
    { id: 'classic', name: 'Classic', note: 'Centered header, ruled sections' },
    { id: 'sidebar', name: 'Two-column', note: 'Skills and education in a side column' },
    { id: 'gutter', name: 'Side headings', note: 'Headings in a left gutter' },
    { id: 'banner', name: 'Header band', note: 'Bold color band behind your name' },
    { id: 'ats', name: 'ATS simple', note: 'Plain single column that parses cleanly' },
  ];

  const FONTS = {
    serif: { name: 'Source Serif', css: "'Source Serif 4', Georgia, 'Times New Roman', serif" },
    sans: { name: 'Source Sans', css: "'Source Sans 3', 'Helvetica Neue', Arial, sans-serif" },
    plex: { name: 'IBM Plex Sans', css: "'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif" },
    garamond: { name: 'EB Garamond', css: "'EB Garamond', Garamond, Georgia, serif" },
    lato: { name: 'Lato', css: "Lato, 'Helvetica Neue', Arial, sans-serif" },
  };

  const PRESETS = [
    { id: 'ink', name: 'Ink', accent: '#1F3A68', font: 'serif' },
    { id: 'evergreen', name: 'Evergreen', accent: '#1E5B4F', font: 'sans' },
    { id: 'graphite', name: 'Graphite', accent: '#33373F', font: 'plex' },
    { id: 'oxblood', name: 'Oxblood', accent: '#7A2230', font: 'garamond' },
    { id: 'harbor', name: 'Harbor', accent: '#0E6480', font: 'lato' },
    { id: 'copper', name: 'Copper', accent: '#8A4B1C', font: 'sans' },
  ];

  const ACCENTS = ['#1F3A68', '#0E6480', '#1E5B4F', '#4A5A1F', '#8A4B1C', '#7A2230', '#5B2E6B', '#33373F'];

  const SECTION_TYPES = {
    summary: { label: 'Summary', title: 'Summary' },
    experience: { label: 'Experience', title: 'Experience' },
    education: { label: 'Education', title: 'Education' },
    skills: { label: 'Skills', title: 'Skills' },
    projects: { label: 'Projects', title: 'Projects' },
    list: { label: 'Certifications', title: 'Certifications' },
    text: { label: 'Custom text', title: 'Volunteering' },
  };

  // Page margins in px at 96dpi (1in = 96px). The writing guides call one inch standard.
  const MARGINS = {
    narrow: { name: 'Narrow', label: '0.5 in', px: 48 },
    medium: { name: 'Medium', label: '0.75 in', px: 72 },
    wide: { name: 'Standard', label: '1 in', px: 96 },
  };
  // Body text size; pt = px * 0.75. Guides recommend 10.5 to 12 pt for body text.
  const TEXT_SIZES = {
    small: { name: 'Small', pt: 10, px: 13.33 },
    normal: { name: 'Normal', pt: 10.5, px: 14 },
    large: { name: 'Large', pt: 11.5, px: 15.33 },
  };

  // Resume formats. Each one is a section order; sections not listed keep their place after these.
  const FORMATS = [
    { id: 'chronological', name: 'Chronological', note: 'Newest job first. What most recruiters expect if your work history is steady.',
      order: ['summary', 'experience', 'skills', 'education', 'list'] },
    { id: 'hybrid', name: 'Hybrid', note: 'Skills up top, then your full work history. Good for senior roles and career changers.',
      order: ['summary', 'skills', 'experience', 'education', 'list'] },
    { id: 'functional', name: 'Skills-based', note: 'Skills and projects lead, work history goes last. For career changers, gaps or new grads.',
      warn: 'Some applicant tracking systems read skills-based resumes poorly. Pick Hybrid if you mostly apply online.',
      order: ['summary', 'skills', 'projects', 'education', 'experience', 'list'], adds: ['projects'] },
  ];

  // Reorder a resume's sections for a format, adding any core section the format needs.
  function applyFormat(r, id) {
    const f = FORMATS.find((x) => x.id === id) || FORMATS[0];
    const core = ['summary', 'experience', 'skills', 'education'].concat(f.adds || []);
    core.forEach((type) => { if (!r.sections.some((s) => s.type === type)) r.sections.push(blankSection(type)); });
    const rank = (s) => { const i = f.order.indexOf(s.type); return i < 0 ? f.order.length : i; };
    r.sections = r.sections.map((s, i) => [s, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map((x) => x[0]);
    r.format = f.id;
    return r;
  }

  // Sections that go in the side column of the two-column template
  const SIDE_TYPES = new Set(['skills', 'education', 'list']);

  let seq = 0;
  function uid(prefix) {
    seq++;
    return (prefix || 'x') + Date.now().toString(36) + seq.toString(36) + Math.random().toString(36).slice(2, 5);
  }

  function blankItem(type) {
    if (type === 'experience') return { id: uid('i'), role: '', org: '', location: '', start: '', end: '', current: false, bullets: '' };
    if (type === 'education') return { id: uid('i'), degree: '', school: '', location: '', start: '', end: '', details: '' };
    if (type === 'projects') return { id: uid('i'), name: '', link: '', start: '', end: '', bullets: '' };
    return null;
  }

  function blankSection(type) {
    const s = { id: uid('s'), type, title: SECTION_TYPES[type].title, hidden: false };
    if (type === 'experience' || type === 'education' || type === 'projects') s.items = [blankItem(type)];
    else s.text = '';
    return s;
  }

  function blankResume(name) {
    return {
      id: uid('r'),
      name: name || 'Untitled resume',
      template: 'classic',
      preset: 'ink',
      accent: '#1F3A68',
      font: 'serif',
      density: 'comfortable',
      textSize: 'normal',
      margin: 'wide',
      paper: 'letter',
      updatedAt: Date.now(),
      contact: { name: '', headline: '', email: '', phone: '', location: '', website: '', linkedin: '' },
      format: 'chronological',
      sections: ['summary', 'experience', 'skills', 'education'].map(blankSection),
    };
  }

  // Example content. Some bullets are deliberately rough so the assistant has something to show.
  function sampleResume() {
    const r = blankResume('Example: Account Executive');
    r.isExample = true;
    r.contact = {
      name: 'Jordan Rivera',
      headline: 'Senior Account Executive, B2B SaaS',
      email: 'jordan.rivera@example.com',
      phone: '(512) 555-0148',
      location: 'Austin, TX',
      website: '',
      linkedin: 'linkedin.com/in/jordanrivera',
    };
    r.sections = [
      { id: uid('s'), type: 'summary', title: 'Summary', hidden: false,
        text: 'Account executive with 7 years of B2B SaaS sales experience. I am a very results-driven closer who has consistently exceeded quota by building trust with finance and operations leaders. Known for turning cold outbound into long-term partnerships.' },
      { id: uid('s'), type: 'experience', title: 'Experience', hidden: false, items: [
        { id: uid('i'), role: 'Senior Account Executive', org: 'Northwind Analytics', location: 'Austin, TX', start: 'Mar 2022', end: '', current: true,
          bullets: 'Manage a book of 45 mid-market accounts worth $3.2M in annual recurring revenue\nClosed 118% of annual quota in 2023 and ranked #2 of 24 reps\nWas responsible for building a outbound playbook that the team uses on a daily basis\nPartner with solutions engineers to run technical demos for VP-level buyers' },
        { id: uid('i'), role: 'Account Executive', org: 'Brightline Software', location: 'Denver, CO', start: 'Jun 2019', end: 'Feb 2022', current: false,
          bullets: 'Helped launch a new partner channel that sourced $900K in pipeline in its first year\nWorked on alot of renewals and reduced churn by 9%\nI trained 6 new SDRs on discovery calls and objection handling\nIncreased average deal size 22% by introducing multi-year pricing' },
        { id: uid('i'), role: 'Sales Development Representative', org: 'Copperleaf', location: 'Denver, CO', start: 'Aug 2017', end: 'May 2019', current: false,
          bullets: 'Booked 40+ qualified meetings per month, 130% of target\nPromoted to Account Executive after 20 months' },
      ] },
      { id: uid('s'), type: 'education', title: 'Education', hidden: false, items: [
        { id: uid('i'), degree: 'B.B.A. in Marketing', school: 'University of Colorado Boulder', location: 'Boulder, CO', start: '2013', end: '2017', details: '' },
      ] },
      { id: uid('s'), type: 'skills', title: 'Skills', hidden: false,
        text: 'Sales: Discovery, MEDDICC, Negotiation, Forecasting\nTools: Salesforce, HubSpot, Gong, Outreach, Sales Navigator' },
      { id: uid('s'), type: 'list', title: 'Certifications', hidden: false,
        text: 'Challenger Sales Certified, 2021\nSalesforce Certified Administrator, 2020' },
    ];
    return applyFormat(r, 'chronological');
  }

  /* ------------------------------------------------------------ render */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function lines(text) {
    return String(text || '').split('\n').map((l) => l.replace(/^\s*[-•*·]\s*/, '').trim()).filter(Boolean);
  }
  function dates(item) {
    const end = item.current ? 'Present' : item.end;
    if (item.start && end) return esc(item.start) + ' – ' + esc(end);
    return esc(item.start || end || '');
  }

  function contactParts(c) {
    return [c.email, c.phone, c.location, c.linkedin, c.website].filter((x) => x && String(x).trim());
  }

  function renderSection(s, tpl) {
    if (s.hidden) return '';
    const head = `<h2 class="rs-h">${esc(s.title)}</h2>`;
    let body = '';
    if (s.type === 'summary' || s.type === 'text') {
      const paras = String(s.text || '').split(/\n{2,}|\n/).map((p) => p.trim()).filter(Boolean);
      if (!paras.length) return '';
      body = paras.map((p) => `<p class="rs-p">${esc(p)}</p>`).join('');
    } else if (s.type === 'skills') {
      const ls = lines(s.text);
      if (!ls.length) return '';
      body = '<div class="rs-skills">' + ls.map((l) => {
        const m = l.match(/^([^:]{1,40}):\s*(.*)$/);
        const items = (m ? m[2] : l).split(/\s*,\s*/).filter(Boolean);
        const list = tpl === 'sidebar'
          ? '<ul class="rs-chips">' + items.map((i) => `<li>${esc(i)}</li>`).join('') + '</ul>'
          : `<span>${items.map(esc).join(' · ')}</span>`;
        return `<div class="rs-skill">${m ? `<strong>${esc(m[1])}</strong>` : ''}${list}</div>`;
      }).join('') + '</div>';
    } else if (s.type === 'list') {
      const ls = lines(s.text);
      if (!ls.length) return '';
      body = '<ul class="rs-list">' + ls.map((l) => `<li>${esc(l)}</li>`).join('') + '</ul>';
    } else if (s.type === 'experience' || s.type === 'projects' || s.type === 'education') {
      const items = (s.items || []).filter((it) => Object.keys(it).some((k) => k !== 'id' && k !== 'current' && String(it[k] || '').trim()));
      if (!items.length) return '';
      body = items.map((it) => {
        let title, sub, extra = '';
        if (s.type === 'experience') {
          title = esc(it.role);
          sub = [esc(it.org), esc(it.location)].filter(Boolean).join(', ');
          extra = lines(it.bullets);
        } else if (s.type === 'projects') {
          title = esc(it.name);
          sub = esc(it.link);
          extra = lines(it.bullets);
        } else {
          title = esc(it.degree);
          sub = [esc(it.school), esc(it.location)].filter(Boolean).join(', ');
          extra = lines(it.details);
        }
        const bl = extra.length ? `<ul class="rs-bullets">${extra.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : '';
        const d = dates(it);
        return `<div class="rs-item"><div class="rs-item-top"><div class="rs-item-title">${title}${sub ? `<span class="rs-item-sub">${sub}</span>` : ''}</div>${d ? `<div class="rs-date">${d}</div>` : ''}</div>${bl}</div>`;
      }).join('');
    }
    return `<section class="rs-sec rs-sec-${s.type}">${head}<div class="rs-body">${body}</div></section>`;
  }

  function renderHeader(c, tpl) {
    const parts = contactParts(c);
    const sep = tpl === 'sidebar' ? '' : '<span class="rs-sep" aria-hidden="true">·</span>';
    const contact = parts.length ? `<div class="rs-contact">${parts.map((p) => `<span>${esc(p)}</span>`).join(sep)}</div>` : '';
    return `<header class="rs-head"><h1 class="rs-name">${esc(c.name) || 'Your Name'}</h1>${c.headline ? `<div class="rs-headline">${esc(c.headline)}</div>` : ''}${tpl === 'sidebar' ? '' : contact}</header>`;
  }

  function sheetStyle(r) {
    const font = (FONTS[r.font] || FONTS.serif).css;
    const m = (MARGINS[r.margin] || MARGINS.narrow).px;
    const fs = (TEXT_SIZES[r.textSize] || TEXT_SIZES.normal).px;
    return `--rs-accent:${esc(r.accent || '#1F3A68')};--rs-font:${font.replace(/"/g, "'")};--rs-density:${r.density === 'compact' ? 0.86 : 1};--rs-fs:${fs}px;--rs-m:${m}px;`;
  }

  function renderResume(r) {
    const tpl = r.template || 'classic';
    const secs = r.sections || [];
    let inner;
    if (tpl === 'sidebar') {
      const parts = contactParts(r.contact);
      const contact = parts.length ? `<section class="rs-sec rs-sec-contact"><h2 class="rs-h">Contact</h2><div class="rs-body"><ul class="rs-list rs-contact-list">${parts.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div></section>` : '';
      const side = secs.filter((s) => SIDE_TYPES.has(s.type)).map((s) => renderSection(s, tpl)).join('');
      const main = secs.filter((s) => !SIDE_TYPES.has(s.type)).map((s) => renderSection(s, tpl)).join('');
      inner = `${renderHeader(r.contact, tpl)}<div class="rs-cols"><aside class="rs-side">${contact}${side}</aside><div class="rs-main">${main}</div></div>`;
    } else {
      inner = renderHeader(r.contact, tpl) + secs.map((s) => renderSection(s, tpl)).join('');
    }
    return `<article class="rs t-${tpl} paper-${r.paper === 'a4' ? 'a4' : 'letter'}" style="${sheetStyle(r)}">${inner}</article>`;
  }

  function plainText(r) {
    const out = [];
    const c = r.contact || {};
    out.push(c.name || '');
    if (c.headline) out.push(c.headline);
    const parts = contactParts(c);
    if (parts.length) out.push(parts.join(' | '));
    for (const s of r.sections || []) {
      if (s.hidden) continue;
      const block = [];
      if (s.items) {
        for (const it of s.items) {
          const title = s.type === 'experience' ? [it.role, it.org].filter(Boolean).join(', ') : s.type === 'projects' ? it.name : [it.degree, it.school].filter(Boolean).join(', ');
          const d = dates(it).replace('&amp;', '&');
          if (!title && !d) continue;
          block.push([title, it.location, d].filter(Boolean).join(' | '));
          lines(it.bullets || it.details).forEach((b) => block.push('- ' + b));
        }
      } else {
        lines(s.text).forEach((l) => block.push(s.type === 'list' ? '- ' + l : l));
      }
      if (block.length) out.push('', s.title.toUpperCase(), ...block);
    }
    return out.join('\n').trim() + '\n';
  }

  root.ResumeTemplates = { TEMPLATES, PRESETS, FONTS, ACCENTS, SECTION_TYPES, FORMATS, MARGINS, TEXT_SIZES, applyFormat, uid, blankItem, blankSection, blankResume, sampleResume, renderResume, plainText, esc };
})(typeof self !== 'undefined' ? self : this);
