# Desinteligência Humana — apresentação (IA × IHC)

Apresentação com estilo e transições inspirados em [huyml.co](https://huyml.co/): um clique faz o robô empurrar a parede
preta e revelar a capa; cada slide aparece em tela cheia e, na troca, a câmera se afasta até a pilha 3D de cartões,
gira até o próximo e aproxima de novo.
Site estático: abra `index.html` no navegador (funciona offline) ou publique a pasta na Vercel sem configuração.

| Tecla / gesto | Ação |
|---|---|
| → · ↓ · espaço · rolar o mouse | próximo slide |
| ← · ↑ · rolar para cima | slide anterior |
| O | visão geral em blocos (clique num cartão para abrir) |
| L | visão geral em lista: a gaveta com detalhes e lista ao redor; ← → passam de cartão, Enter ou clique abre |
| Esc | fecha a visão geral |
| F | tela cheia |
| Home / End | primeiro / último slide |

As seções à esquerda, os itens do Sumário, a lista da direita e os cartões vizinhos são clicáveis.
A URL guarda o slide atual (`index.html#6`).

Cada slide é um `<article class="cartao">` em `index.html`. Os atributos `data-*` alimentam o que fica ao redor da pilha:
`data-titulo`, `data-categoria` e `data-desc` (lista da direita), `data-detalhes` (pares `Rótulo|Valor;…` à esquerda),
`data-secao` (seção destacada) e `data-cores` (os três quadradinhos). O conteúdo de cada cartão é desenhado em 1200 × 675 px e escalado.
