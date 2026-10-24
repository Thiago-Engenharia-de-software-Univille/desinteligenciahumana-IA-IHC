(() => {
  const BASE_W = 1200, BASE_H = 675;  // tamanho em que o conteúdo do cartão foi desenhado
  const ITEM_LISTA = 172;             // altura de cada item da lista da direita (px)
  const reduzMovimento = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const body = document.body;
  const pilha = document.getElementById('pilha');
  const tela = document.getElementById('tela');
  const parede = document.getElementById('parede');
  const cartoes = [...pilha.querySelectorAll('.cartao')];
  const N = cartoes.length;
  const TOTAL = N + 1;                // capa + cartões

  const lista = document.getElementById('lista');
  const trilho = document.getElementById('lista-trilho');
  const detalhes = document.getElementById('detalhes');
  const numero = document.querySelector('#numero strong');
  const contador = document.getElementById('contador');
  const cores = [...document.querySelectorAll('#cores i')];
  const secoes = [...document.querySelectorAll('#secoes li')];
  const laterais = ['#esquerda', '#lista', '#cores', '.dica-scroll'].map(s => document.querySelector(s));
  const topo = document.getElementById('topo');

  // ---------- Peças mecânicas desenhadas no carregamento ----------
  const arred = v => Math.round(v * 10) / 10;
  const polar = (raio, ang) => `${arred(raio * Math.cos(ang))} ${arred(raio * Math.sin(ang))}`;

  // engrenagem centrada em 0,0: data-eng="dentes,raio externo,raio interno,furo"
  document.querySelectorAll('[data-eng]').forEach(el => {
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
  document.querySelectorAll('.medidor').forEach(svg => {
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

  // ---------- Lista da direita ----------
  const itens = cartoes.map((c, i) => {
    const el = document.createElement('div');
    el.className = 'item-lista';
    el.innerHTML = `<small></small><strong></strong><i>—</i><p></p>`;
    el.querySelector('small').textContent = c.dataset.categoria;
    el.querySelector('strong').textContent = c.dataset.titulo;
    el.querySelector('p').textContent = c.dataset.desc;
    el.addEventListener('click', () => escolher(i));
    trilho.appendChild(el);
    return el;
  });

  // ---------- Estado ----------
  // pos:   posição contínua na pilha (0 = primeiro cartão)
  // foco:  1 = cartão atual em tela cheia, 0 = visão da pilha
  // geral: 1 = visão geral em grade
  // zoom:  < 1 enquanto a pilha gira de um cartão para outro (afasta para mostrar mais slides)
  // emFoco: cartão que se afasta/aproxima da tela cheia (o antigo na saída, o novo na chegada)
  const est = { pos: 0, foco: 0, geral: 0, zoom: 1, emFoco: 0 };
  const AFASTAR = .42;                // quanto a pilha encolhe no meio da troca
  const ZOOM_LISTA = .72;             // tamanho da gaveta na visão em lista
  let modo = 'parede';                // parede → empurrando → hero → pilha
  let alvo = 0;
  let anim = null, laco = null;
  let m = {};

  const suave = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const lerp = (a, b, t) => a + (b - a) * t;
  const fase = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));

  // ---------- Layout ----------
  function medir() {
    const vw = innerWidth, vh = innerHeight;
    const estreito = vw < 900;

    // em tela cheia o cartão tem o tamanho exato da tela; o conteúdo (desenhado em
    // 1200 × 675) é escalado para caber e a caixa dele se estica no outro eixo
    const k = Math.min(vw / BASE_W, vh / BASE_H);
    const r = vh / vw;

    // tamanho do cartão na visão da pilha, entre as colunas laterais
    let w, cx;
    if (estreito) {
      w = Math.min(vw * .92, vh * .6 / r);
      cx = vw / 2;
    } else {
      const esq = 28 + vw * .17;
      const dir = vw - (28 + vw * .026 + vw * .16);
      w = Math.min(vw * .6, (vh - 170) / r, dir - esq - 24);
      cx = (esq + dir) / 2;
    }
    m = { vw, vh, wf: vw, hf: vh, w, h: w * r, ox: cx - vw / 2, oy: 8, estreito };

    pilha.style.setProperty('--k', k);
    pilha.style.setProperty('--cw', vw / k + 'px');
    pilha.style.setProperty('--ch', vh / k + 'px');
    for (const c of cartoes) {
      c.style.width = vw + 'px';
      c.style.height = vh + 'px';
    }
  }

  // Posição de um cartão na "gaveta de arquivos" (d = distância até o cartão atual):
  // os cartões ficam numa diagonal, os anteriores subindo para a direita e os próximos
  // descendo para a esquerda; longe do atual eles se amontoam como fichas tombadas
  function naPilha(d) {
    const a = Math.abs(d), s = Math.sign(d);
    const perto = Math.min(a, 1), longe = Math.max(a - 1, 0);
    const z = est.zoom;
    return {
      x: m.ox - s * (m.w * .46 * perto + m.w * .075 * longe) * z,
      y: m.oy + s * (m.h * 1.08 * perto + m.h * .2 * longe) * z,
      z: 0,
      rx: 22 * perto,
      ry: -14 * perto,
      rz: 7 * perto,
      s: (m.w / m.wf) * (1 - .04 * perto) * z,
      op: Math.max(0, Math.min(1, 1 - (a - 6.5) * .6)),
    };
  }

  // Posição de um cartão na grade da visão geral
  function naGrade(i) {
    const cols = m.estreito ? 3 : 5;
    const linhas = Math.ceil(N / cols);
    const cw = m.vw * .9 / cols, ch = (m.vh - 110) / linhas;
    const col = i % cols, lin = Math.floor(i / cols);
    const naLinha = lin === linhas - 1 ? N - lin * cols : cols;
    return {
      x: (col - (naLinha - 1) / 2) * cw,
      y: (lin - (linhas - 1) / 2) * ch + 10,
      z: 0, rx: 0, ry: 0, rz: 0,
      s: Math.min(cw * .9 / m.wf, ch * .86 / m.hf),
      op: 1,
    };
  }

  const CHEIA = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, s: 1, op: 1 };

  function misturar(p, q, t) {
    if (t <= 0) return p;
    const r = {};
    for (const k in p) r[k] = lerp(p[k], q[k], t);
    return r;
  }

  function desenhar() {
    const { pos, foco, geral, emFoco } = est;

    cartoes.forEach((c, i) => {
      const d = i - pos;
      let f = misturar(naPilha(d), naGrade(i), geral);
      const focado = i === emFoco && foco > 0;
      if (focado) f = misturar(f, CHEIA, foco);

      c.style.visibility = f.op <= .01 ? 'hidden' : 'visible';
      c.style.opacity = f.op;
      // ordem de trás para a frente ao longo da diagonal, como fichas numa gaveta
      c.style.zIndex = focado ? 1000 : 500 + Math.round(d * 10);
      c.style.transform = focado && foco >= 1 ? 'none' :
        `translate3d(${f.x}px, ${f.y}px, ${f.z}px) rotateZ(${f.rz}deg) rotateX(${f.rx}deg) rotateY(${f.ry}deg) scale(${f.s})`;
      c.style.boxShadow = focado ? `0 18px 50px rgba(0,0,0,${.1 * (1 - foco)})` : '';
    });

    // fundo da tela cheia e colunas laterais
    tela.style.visibility = foco > .01 ? 'visible' : 'hidden';
    tela.style.opacity = foco;
    // as colunas somem bem antes do cartão chegar à tela cheia, para não ficarem por cima dele
    const livre = (1 - foco) ** 3;
    const lateral = livre * (1 - geral);
    laterais.forEach(el => { el.style.opacity = lateral; });
    topo.style.opacity = livre;
    body.classList.toggle('tela-cheia', foco > .5);

    // a lista acompanha a pilha
    trilho.style.transform = `translateY(${lista.clientHeight / 2 - (pos + .5) * ITEM_LISTA}px)`;
    itens.forEach((el, i) => { el.style.opacity = Math.max(.14, 1 - Math.abs(i - pos) * .45); });
  }

  // ---------- Animação ----------
  function animar(dur, passo, fim) {
    anim = { t0: performance.now(), dur: reduzMovimento ? 0 : dur, passo, fim };
    if (laco) return;
    const quadro = agora => {
      if (anim) {
        const a = anim;
        const t = a.dur ? Math.min(1, (agora - a.t0) / a.dur) : 1;
        a.passo(t);
        if (t >= 1) { anim = null; a.fim?.(); }
      }
      desenhar();
      laco = anim ? requestAnimationFrame(quadro) : null;
    };
    laco = requestAnimationFrame(quadro);
  }

  // ---------- Informações ao redor da pilha ----------
  function mostrarInfo(i) {
    const c = cartoes[i];
    numero.textContent = String(i + 2).padStart(2, '0');

    detalhes.innerHTML = '';
    for (const par of (c.dataset.detalhes || '').split(';').filter(Boolean)) {
      const [k, v] = par.split('|');
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v;
      detalhes.append(dt, dd);
    }

    (c.dataset.cores || '').split(',').forEach((cor, k) => { if (cores[k]) cores[k].style.background = cor; });
    secoes.forEach(li => li.classList.toggle('ativa', li.dataset.secao === c.dataset.secao));
    itens.forEach((el, k) => el.classList.toggle('ativo', k === i));
    cartoes.forEach((el, k) => el.classList.toggle('ativo', k === i));
  }

  function atualizarContador() {
    const n = modo === 'pilha' ? alvo + 2 : 1;
    contador.textContent = `${n} / ${TOTAL}`;
    history.replaceState(null, '', '#' + n);
  }

  // ---------- Transições ----------

  // Tela cheia → afasta até a pilha → gira até o cartão i → aproxima em tela cheia
  function irPara(i) {
    if (modo !== 'pilha') return;
    i = Math.max(0, Math.min(N - 1, i));
    if (i === alvo && !anim && est.foco === 1) return;

    const de = { ...est };
    const dist = Math.abs(i - de.pos);
    alvo = i;
    atualizarContador();
    definirVisao(null);
    body.classList.add('trocando');

    let trocou = false;
    const dur = dist < .01 ? 1000 : Math.min(1700 + 180 * dist, 2600);
    animar(dur, t => {
      const sai = suave(fase(t, 0, .3));
      const gira = fase(t, .2, .8);
      const entra = suave(fase(t, .72, 1));
      est.emFoco = entra > 0 ? i : de.emFoco;
      est.foco = entra > 0 ? entra : de.foco * (1 - sai);
      est.geral = de.geral * (1 - suave(fase(t, 0, .4)));
      est.pos = lerp(de.pos, i, suave(gira));
      est.zoom = lerp(de.zoom, 1, suave(t)) - AFASTAR * Math.sin(Math.PI * gira) * Math.min(dist, 1);
      if (gira >= .5 && !trocou) { trocou = true; mostrarInfo(i); }
      if (gira >= 1) body.classList.remove('trocando');
    }, () => { est.foco = 1; est.zoom = 1; });
  }

  // ---------- Visões gerais: em blocos (grade) e em lista (gaveta navegável) ----------
  let visao = null;                   // null | 'blocos' | 'lista'
  const emGeral = () => visao === 'blocos';
  const emLista = () => visao === 'lista';
  const dica = document.querySelector('.dica-scroll');

  function definirVisao(v) {
    visao = v;
    body.classList.toggle('visao-geral', v === 'blocos');
    body.classList.toggle('visao-lista', v === 'lista');
    dica.textContent = v === 'lista' ? 'Role ou use ← → · Enter ou clique para abrir' : 'Role ou use ← →';
  }

  function abrirGeral() {
    if (modo !== 'pilha') return;
    const de = { ...est };
    definirVisao('blocos');
    animar(1200, t => {
      est.foco = de.foco * (1 - suave(fase(t, 0, .45)));
      est.geral = lerp(de.geral, 1, suave(fase(t, .3, 1)));
      est.zoom = lerp(de.zoom, 1, suave(t));
    });
  }

  // Lista: sai da tela cheia e fica na gaveta, com detalhes, número e lista ao redor
  function abrirLista() {
    if (modo !== 'pilha') return;
    const de = { ...est };
    definirVisao('lista');
    animar(1100, t => {
      est.foco = de.foco * (1 - suave(fase(t, 0, .55)));
      est.geral = de.geral * (1 - suave(fase(t, 0, .6)));
      est.zoom = lerp(de.zoom, ZOOM_LISTA, suave(fase(t, .1, 1)));
    });
  }

  // Na lista, passa para outro cartão sem abrir em tela cheia (como no site de inspiração)
  function moverLista(i) {
    i = Math.max(0, Math.min(N - 1, i));
    if (i === alvo && !anim) return;
    const de = { ...est };
    const dist = Math.abs(i - de.pos);
    alvo = i;
    atualizarContador();
    body.classList.add('trocando');
    let trocou = false;
    animar(Math.min(800 + 140 * dist, 1600), t => {
      const e = suave(t);
      est.pos = lerp(de.pos, i, e);
      est.zoom = lerp(de.zoom, ZOOM_LISTA, e);
      if (t >= .5 && !trocou) { trocou = true; mostrarInfo(i); }
      if (t >= 1) body.classList.remove('trocando');
    });
  }

  // clique na lista da direita ou nas seções
  function escolher(i) { emLista() ? moverLista(i) : irPara(i); }

  // Sai da capa: o painel cinza sobe, a pilha entra de baixo e o primeiro cartão abre em tela cheia
  function entrarNaPilha(i = 0) {
    definirModo('pilha');
    alvo = i;
    mostrarInfo(i);
    atualizarContador();
    const inicio = i - 2.6;
    Object.assign(est, { pos: inicio, foco: 0, geral: 0, zoom: 1, emFoco: i });
    body.classList.add('trocando');
    animar(2300, t => {
      est.pos = lerp(inicio, i, suave(fase(t, 0, .62)));
      est.foco = suave(fase(t, .66, 1));
      if (t > .62) body.classList.remove('trocando');
    });
  }

  function voltarParaCapa() {
    const de = { ...est };
    animar(700, t => { est.foco = de.foco * (1 - suave(t)); }, () => definirModo('hero'));
  }

  // ---------- Robô: ciclo de caminhada ----------
  // A fase do passo é derivada de quanto a parede já andou, então o pé de apoio
  // acompanha o chão em vez de escorregar. Unidades = viewBox do SVG (330 × 400).
  const robo = (() => {
    const svg = parede.querySelector('.robo');
    const $ = id => svg.getElementById(id);
    const COXA = 70, CANELA = 72, SOLO = 398, SOLA = 12;
    const PASSADA = 216;              // quanto o corpo avança por ciclo completo
    const rad = Math.PI / 180;
    const pernas = [
      { el: $('perna-tras'), x: 163, defasagem: 0 },
      { el: $('perna-frente'), x: 179, defasagem: .5 },
    ];
    const bracos = [
      { el: $('braco-tras'), ombro: [224, 150], cotovelo: [266, 160], mao: [304, 146] },
      { el: $('braco-frente'), ombro: [236, 166], cotovelo: [280, 180], mao: [310, 168] },
    ];
    const tronco = $('tronco'), antena = $('antena');

    // ângulos de uma perna (graus; positivo = pé para trás)
    function angulos(fase) {
      const a = 2 * Math.PI * fase;
      return {
        quadril: 6 + 20 * Math.sin(a),                              // apoio: a perna vai de -14° a 26°
        joelho: 6 + 40 * Math.max(0, -Math.cos(a + .5)) ** 1.5,     // dobra logo após o impulso, estica antes de pisar
        ponta: 24 * Math.max(0, Math.sin(a + .4)) ** 3,             // calcanhar sobe no impulso
      };
    }

    function pose(fase) {
      const ps = pernas.map(p => {
        const g = angulos(fase + p.defasagem);
        const q = g.quadril * rad, j = (g.quadril + g.joelho) * rad;
        const joelho = [p.x - COXA * Math.sin(q), COXA * Math.cos(q)];
        const tornozelo = [joelho[0] - CANELA * Math.sin(j), joelho[1] + CANELA * Math.cos(j)];
        return { p, g, joelho, tornozelo };
      });
      // o pé mais baixo fica apoiado no chão; o quadril sobe e desce junto
      const quadrilY = SOLO - SOLA - Math.max(...ps.map(l => l.tornozelo[1]));
      const balanco = quadrilY - 252;

      for (const { p, g, joelho, tornozelo } of ps) {
        const d = `M${p.x} ${quadrilY} L${joelho[0]} ${joelho[1] + quadrilY} L${tornozelo[0]} ${tornozelo[1] + quadrilY}`;
        p.el.querySelectorAll('.contorno, .miolo').forEach(el => el.setAttribute('d', d));
        p.el.querySelector('.pe').setAttribute('transform',
          `translate(${tornozelo[0]} ${tornozelo[1] + quadrilY}) rotate(${g.ponta})`);
      }

      const a = 4 * Math.PI * fase;
      tronco.setAttribute('transform', `translate(0 ${balanco}) rotate(${14 + 1.2 * Math.sin(a)} 170 255)`);
      antena.setAttribute('transform', `rotate(${5 * Math.sin(a - 1)} 168 40)`);
      // ombros acompanham o tronco; as mãos ficam paradas na parede
      for (const b of bracos) {
        const d = `M${b.ombro[0]} ${b.ombro[1] + balanco} L${b.cotovelo[0]} ${b.cotovelo[1] + balanco / 2} L${b.mao[0]} ${b.mao[1]}`;
        b.el.querySelectorAll('.contorno, .miolo').forEach(el => el.setAttribute('d', d));
      }
    }

    function andar() {
      if (modo !== 'empurrando') return;
      const x = new DOMMatrix(getComputedStyle(parede).transform).m41;
      const escala = svg.getBoundingClientRect().height / 400;
      pose(x / (PASSADA * escala));
      requestAnimationFrame(andar);
    }

    pose(0);
    return { andar };
  })();

  // ---------- Abertura ----------
  function definirModo(novo) {
    modo = novo;
    for (const k of ['parede', 'empurrando', 'hero', 'pilha']) body.classList.toggle('modo-' + k, k === novo);
    atualizarContador();
  }

  function empurrarParede() {
    if (modo !== 'parede') return;
    definirModo('empurrando');
    requestAnimationFrame(robo.andar);
    parede.addEventListener('animationend', () => { if (modo === 'empurrando') definirModo('hero'); }, { once: true });
  }

  // ---------- Navegação ----------
  function proximo() {
    if (modo === 'parede') return empurrarParede();
    if (modo === 'empurrando') return definirModo('hero');
    if (modo === 'hero') return entrarNaPilha(0);
    if (emGeral()) return irPara(alvo);
    if (emLista()) return moverLista(alvo + 1);
    irPara(alvo + 1);
  }

  function anterior() {
    if (modo === 'parede') return empurrarParede();
    if (modo !== 'pilha') return;
    if (emGeral()) return irPara(alvo);
    if (emLista()) return moverLista(alvo - 1);
    if (alvo === 0) return voltarParaCapa();
    irPara(alvo - 1);
  }

  function alternarGeral() {
    if (modo !== 'pilha') return;
    emGeral() ? irPara(alvo) : abrirGeral();
  }

  function alternarLista() {
    if (modo !== 'pilha') return;
    emLista() ? irPara(alvo) : abrirLista();
  }

  function telaCheia() {
    document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.();
  }

  // ---------- Eventos ----------
  addEventListener('keydown', e => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    switch (e.key) {
      case 'Enter':
        e.preventDefault(); emLista() ? irPara(alvo) : proximo(); break;
      case 'ArrowRight': case 'ArrowDown': case 'PageDown': case ' ':
        e.preventDefault(); proximo(); break;
      case 'ArrowLeft': case 'ArrowUp': case 'PageUp': case 'Backspace':
        e.preventDefault(); anterior(); break;
      case 'Home': escolher(0); break;
      case 'End': modo === 'pilha' ? escolher(N - 1) : entrarNaPilha(N - 1); break;
      case 'o': case 'O': alternarGeral(); break;
      case 'l': case 'L': alternarLista(); break;
      case 'Escape': if (visao) irPara(alvo); break;
      case 'f': case 'F': telaCheia(); break;
    }
  });

  // Rolagem: um passo por gesto (ignora a inércia do touchpad enquanto anima)
  let acumulado = 0, travaAte = 0, zerar;
  addEventListener('wheel', e => {
    const agora = performance.now();
    clearTimeout(zerar);
    zerar = setTimeout(() => { acumulado = 0; }, 180);
    if (agora < travaAte || (anim && modo === 'pilha')) return;
    acumulado += Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (Math.abs(acumulado) > 40) {
      acumulado > 0 ? proximo() : anterior();
      acumulado = 0;
      travaAte = agora + 900;
    }
  }, { passive: true });

  // Deslizar no celular
  let toque = null;
  addEventListener('touchstart', e => { toque = e.touches[0]; }, { passive: true });
  addEventListener('touchend', e => {
    if (!toque) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - toque.clientX, dy = t.clientY - toque.clientY;
    const d = Math.abs(dy) > Math.abs(dx) ? dy : dx;
    if (Math.abs(d) > 50) d < 0 ? proximo() : anterior();
    toque = null;
  });

  // Blocos: clicar abre o cartão. Lista: clicar no atual abre, num vizinho passa até ele
  cartoes.forEach((c, i) => c.addEventListener('click', () => {
    if (emGeral()) irPara(i);
    else if (emLista()) i === alvo ? irPara(i) : moverLista(i);
  }));

  // Destaque ao passar o mouse: cartão e item da lista acendem juntos
  cartoes.forEach((c, i) => {
    const marcar = ligado => () => {
      c.classList.toggle('destaque', ligado);
      itens[i].classList.toggle('destaque', ligado);
    };
    for (const el of [c, itens[i]]) {
      el.addEventListener('mouseenter', marcar(true));
      el.addEventListener('mouseleave', marcar(false));
    }
  });

  document.querySelectorAll('[data-goto]').forEach(el => el.addEventListener('click', e => {
    if (visao) return;
    e.stopPropagation();
    irPara(+el.dataset.goto - 2);
  }));

  secoes.forEach(li => li.addEventListener('click', () =>
    escolher(cartoes.findIndex(c => c.dataset.secao === li.dataset.secao))));

  document.getElementById('btn-next').onclick = proximo;
  document.getElementById('btn-prev').onclick = anterior;
  document.getElementById('btn-blocos').onclick = alternarGeral;
  document.getElementById('btn-lista').onclick = alternarLista;
  document.getElementById('btn-fullscreen').onclick = telaCheia;
  document.getElementById('hero').addEventListener('click', proximo);
  parede.addEventListener('click', empurrarParede);

  addEventListener('resize', () => { medir(); desenhar(); });

  // Esconde os controles com o mouse parado
  let ocioso;
  addEventListener('mousemove', () => {
    body.classList.remove('ocioso');
    clearTimeout(ocioso);
    ocioso = setTimeout(() => body.classList.add('ocioso'), 2500);
  });

  // ---------- Início ----------
  medir();
  const doHash = parseInt(location.hash.slice(1), 10);
  if (doHash >= 2 && doHash <= TOTAL) {
    // abre direto no slide, em tela cheia e sem animação de entrada
    body.classList.add('sem-transicao');
    alvo = doHash - 2;
    Object.assign(est, { pos: alvo, foco: 1, emFoco: alvo });
    definirModo('pilha');
    mostrarInfo(alvo);
    requestAnimationFrame(() => requestAnimationFrame(() => body.classList.remove('sem-transicao')));
  } else {
    mostrarInfo(0);
    est.pos = -2.6;
    atualizarContador();
  }
  desenhar();
})();
