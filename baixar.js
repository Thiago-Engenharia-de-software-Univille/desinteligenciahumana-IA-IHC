// Monta as páginas do PDF a partir dos próprios slides do index.html (sem duplicar conteúdo)
(async () => {
  const BASE_W = 1200;
  const destino = document.getElementById('paginas');
  const NS = 'http://www.w3.org/2000/svg';

  document.getElementById('imprimir').addEventListener('click', () => print());

  let doc;
  try {
    const resposta = await fetch('index.html');
    doc = new DOMParser().parseFromString(await resposta.text(), 'text/html');
  } catch {
    document.getElementById('aviso').hidden = false;
    return;
  }

  // padrão de pontos (#pontos) usado pelas ilustrações fica no SVG do robô
  const defs = doc.querySelector('#parede svg defs');
  if (defs) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'defs-ocultos');
    svg.setAttribute('aria-hidden', 'true');
    svg.append(document.importNode(defs, true));
    document.body.prepend(svg);
  }

  const total = doc.querySelectorAll('#pilha .cartao').length + 1;

  function novaPagina(n, rotulo) {
    const pagina = document.createElement('section');
    pagina.className = 'pagina';
    pagina.setAttribute('aria-label', `${n} de ${total}: ${rotulo}`);
    const folha = document.createElement('div');
    folha.className = 'folha';
    pagina.append(folha);
    destino.append(pagina);
    return folha;
  }

  // capa
  const capa = novaPagina(1, 'Capa');
  capa.classList.add('capa');
  for (const sel of ['.hero-alunos', '.hero-titulo', '.hero-curso']) {
    const el = doc.querySelector('#hero ' + sel);
    if (el) capa.append(document.importNode(el, true));
  }

  // slides
  doc.querySelectorAll('#pilha .cartao').forEach((cartao, i) => {
    const folha = novaPagina(i + 2, cartao.dataset.titulo);
    folha.append(document.importNode(cartao.querySelector('.conteudo'), true));
  });

  desenharPecas(destino);

  // na tela, cada página é uma miniatura escalada; na impressão volta a 1200 × 675
  const ajustar = () => destino.querySelectorAll('.pagina').forEach(p =>
    p.style.setProperty('--kp', p.clientWidth / BASE_W));
  new ResizeObserver(ajustar).observe(destino);
  ajustar();

  await document.fonts.ready;
  document.body.classList.add('pronto');
})();
