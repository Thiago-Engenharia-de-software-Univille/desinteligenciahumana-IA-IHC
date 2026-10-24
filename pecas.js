// Peças mecânicas desenhadas no carregamento (usado pela apresentação e pela página do PDF)
function desenharPecas(raiz) {
  const arred = v => Math.round(v * 10) / 10;
  const polar = (raio, ang) => `${arred(raio * Math.cos(ang))} ${arred(raio * Math.sin(ang))}`;

  // engrenagem centrada em 0,0: data-eng="dentes,raio externo,raio interno,furo"
  raiz.querySelectorAll('[data-eng]').forEach(el => {
    const [n, R, r, furo] = el.dataset.eng.split(',').map(Number);
    const passo = 2 * Math.PI / n;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = i * passo;
      pts.push(polar(r, a - passo * .30), polar(R, a - passo * .16), polar(R, a + passo * .16), polar(r, a + passo * .30));
    }
    let d = `M${pts.join(' L')} Z`;
    if (furo) d += ` M${furo} 0 A${furo} ${furo} 0 1 0 ${-furo} 0 A${furo} ${furo} 0 1 0 ${furo} 0 Z`;
    el.setAttribute('d', d);
    el.setAttribute('fill-rule', 'evenodd');
  });

  // medidor semicircular: data-valor="0–100" (vazio = ainda sem dado)
  const NS = 'http://www.w3.org/2000/svg';
  raiz.querySelectorAll('.medidor').forEach(svg => {
    const v = svg.dataset.valor === '' ? null : +svg.dataset.valor;
    const cx = 110, cy = 112, r = 88;
    const ponto = (p, raio) => [cx - raio * Math.cos(Math.PI * p / 100), cy - raio * Math.sin(Math.PI * p / 100)];
    const add = (tag, attrs) => {
      const el = document.createElementNS(NS, tag);
      for (const k in attrs) el.setAttribute(k, attrs[k]);
      svg.appendChild(el);
      return el;
    };
    const arco = `M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}`;
    add('path', { d: arco, class: 'trilho' });
    if (v === null) add('path', { d: arco, class: 'vazio' });
    else add('path', { d: arco, class: 'valor', pathLength: 100, style: `--v:${v}` });
    for (let k = 0; k <= 10; k++) {
      const [x1, y1] = ponto(k * 10, k % 5 ? 64 : 58), [x2, y2] = ponto(k * 10, 72);
      add('line', { x1: arred(x1), y1: arred(y1), x2: arred(x2), y2: arred(y2), class: k % 5 ? 'risco' : 'risco maior' });
    }
    add('line', { x1: cx, y1: cy, x2: cx - 70, y2: cy, class: 'ponteiro', style: `--ang:${(v ?? 0) * 1.8}deg` });
    add('circle', { cx, cy, r: 13, class: 'eixo' });
    add('circle', { cx, cy, r: 4.5, class: 'eixo-miolo' });
  });
}
