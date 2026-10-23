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

  // ---------- Lista da direita ----------
  const itens = cartoes.map((c, i) => {
    const el = document.createElement('div');
    el.className = 'item-lista';
    el.innerHTML = `<small></small><strong></strong><i>—</i><p></p>`;
    el.querySelector('small').textContent = c.dataset.categoria;
    el.querySelector('strong').textContent = c.dataset.titulo;
    el.querySelector('p').textContent = c.dataset.desc;
    el.addEventListener('click', () => irPara(i));
    trilho.appendChild(el);
    return el;
  });

  // ---------- Estado ----------
  // pos:   posição contínua na pilha (0 = primeiro cartão)
  // foco:  1 = cartão atual em tela cheia, 0 = visão da pilha
  // geral: 1 = visão geral em grade
  // zoom:  < 1 enquanto a pilha gira de um cartão para outro
  // emFoco: cartão que se afasta/aproxima da tela cheia (o antigo na saída, o novo na chegada)
  const est = { pos: 0, foco: 0, geral: 0, zoom: 1, emFoco: 0 };
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

  // Posição de um cartão na pilha curva (d = distância até o cartão atual)
  function naPilha(d) {
    const a = Math.abs(d), s = Math.sign(d);
    const perto = Math.min(a, 1), longe = Math.max(a - 1, 0);
    const z = est.zoom;
    return {
      x: m.ox - s * (m.w * .10 * perto + m.w * .035 * longe) * z,
      y: m.oy + s * (m.h * .80 * perto + m.h * .13 * longe) * z,
      z: -a * 90,
      rx: -s * (34 * perto + 5 * longe),
      rz: 6 * perto,
      s: (m.w / m.wf) * (1 - .12 * perto - .025 * longe) * z,
      op: Math.max(0, Math.min(1, 1 - (a - 4.2) * .6)),
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
      z: 0, rx: 0, rz: 0,
      s: Math.min(cw * .9 / m.wf, ch * .86 / m.hf),
      op: 1,
    };
  }

  const CHEIA = { x: 0, y: 0, z: 0, rx: 0, rz: 0, s: 1, op: 1 };

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
      c.style.zIndex = focado ? 1000 : 990 - Math.round(Math.abs(d) * 10);
      c.style.transform = focado && foco >= 1 ? 'none' :
        `translate3d(${f.x}px, ${f.y}px, ${f.z}px) rotateZ(${f.rz}deg) rotateX(${f.rx}deg) scale(${f.s})`;
      c.style.boxShadow = focado ? `0 18px 50px rgba(0,0,0,${.1 * (1 - foco)})` : '';
    });

    // fundo da tela cheia e colunas laterais
    tela.style.visibility = foco > .01 ? 'visible' : 'hidden';
    tela.style.opacity = foco;
    const lateral = (1 - foco) * (1 - geral);
    laterais.forEach(el => { el.style.opacity = lateral; });
    topo.style.opacity = 1 - foco;
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
    body.classList.remove('visao-geral');
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
      est.zoom = 1 - .12 * Math.sin(Math.PI * gira) * Math.min(dist, 1);
      if (gira >= .5 && !trocou) { trocou = true; mostrarInfo(i); }
      if (gira >= 1) body.classList.remove('trocando');
    }, () => { est.foco = 1; est.zoom = 1; });
  }

  function abrirGeral() {
    if (modo !== 'pilha') return;
    const de = { ...est };
    body.classList.add('visao-geral');
    animar(1200, t => {
      est.foco = de.foco * (1 - suave(fase(t, 0, .45)));
      est.geral = lerp(de.geral, 1, suave(fase(t, .3, 1)));
      est.zoom = 1;
    });
  }

  const emGeral = () => body.classList.contains('visao-geral');

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

  // ---------- Abertura ----------
  function definirModo(novo) {
    modo = novo;
    for (const k of ['parede', 'empurrando', 'hero', 'pilha']) body.classList.toggle('modo-' + k, k === novo);
    atualizarContador();
  }

  function empurrarParede() {
    if (modo !== 'parede') return;
    definirModo('empurrando');
    parede.addEventListener('animationend', () => { if (modo === 'empurrando') definirModo('hero'); }, { once: true });
  }

  // ---------- Navegação ----------
  function proximo() {
    if (modo === 'parede') return empurrarParede();
    if (modo === 'empurrando') return definirModo('hero');
    if (modo === 'hero') return entrarNaPilha(0);
    if (emGeral()) return irPara(alvo);
    irPara(alvo + 1);
  }

  function anterior() {
    if (modo === 'parede') return empurrarParede();
    if (modo !== 'pilha') return;
    if (emGeral()) return irPara(alvo);
    if (alvo === 0) return voltarParaCapa();
    irPara(alvo - 1);
  }

  function alternarGeral() {
    if (modo !== 'pilha') return;
    emGeral() ? irPara(alvo) : abrirGeral();
  }

  function telaCheia() {
    document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.();
  }

  // ---------- Eventos ----------
  addEventListener('keydown', e => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    switch (e.key) {
      case 'ArrowRight': case 'ArrowDown': case 'PageDown': case ' ': case 'Enter':
        e.preventDefault(); proximo(); break;
      case 'ArrowLeft': case 'ArrowUp': case 'PageUp': case 'Backspace':
        e.preventDefault(); anterior(); break;
      case 'Home': irPara(0); break;
      case 'End': modo === 'pilha' ? irPara(N - 1) : entrarNaPilha(N - 1); break;
      case 'o': case 'O': alternarGeral(); break;
      case 'Escape': if (emGeral()) irPara(alvo); break;
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

  // Na visão geral, clicar num cartão abre ele em tela cheia
  cartoes.forEach((c, i) => c.addEventListener('click', () => { if (emGeral()) irPara(i); }));

  document.querySelectorAll('[data-goto]').forEach(el => el.addEventListener('click', e => {
    if (emGeral()) return;
    e.stopPropagation();
    irPara(+el.dataset.goto - 2);
  }));

  secoes.forEach(li => li.addEventListener('click', () =>
    irPara(cartoes.findIndex(c => c.dataset.secao === li.dataset.secao))));

  document.getElementById('btn-next').onclick = proximo;
  document.getElementById('btn-prev').onclick = anterior;
  document.getElementById('btn-overview').onclick = alternarGeral;
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
