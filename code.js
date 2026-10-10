// Annotations for all (annotations4all)
// Replica no canvas o conteúdo das annotations do Dev Mode, para que
// qualquer pessoa com acesso ao arquivo (inclusive view-only) consiga ler.

const TAG = 'annotationMirror';
const FONT = 'Inter';
const FONT_STYLES = ['Regular', 'Medium', 'Semi Bold', 'Bold'];

// Cores das categorias de annotation do Figma
const CATEGORY_COLORS = {
  yellow: '#E8A300',
  orange: '#F57F17',
  red: '#E5303C',
  pink: '#E33D97',
  violet: '#8C4AF2',
  blue: '#0D7EF2',
  teal: '#00A3B4',
  green: '#18A058'
};
const DEFAULT_COLOR = '#0D7EF2';
// Temas dos cards
const THEMES = {
  light: {
    surface: '#FFFFFF', border: '#E3E3E3', ink: '#1E1E1E', muted: '#6B6B6B',
    link: '#0D7EF2', code: '#B4235A', chipAlpha: 0.12, highlightAlpha: 0.06, shadowAlpha: 0.08
  },
  dark: {
    surface: '#2C2C2C', border: '#444444', ink: '#F5F5F5', muted: '#ABABAB',
    link: '#5CB0FF', code: '#FF7AB6', chipAlpha: 0.24, highlightAlpha: 0.12, shadowAlpha: 0.4
  }
};
let T = THEMES.light;

// Texto dos marcadores (sobre a cor da categoria)
const BADGE_DARK = '#1E1E1E';
const BADGE_LIGHT = '#FFFFFF';

function shadow() {
  return {
    type: 'DROP_SHADOW',
    color: { r: 0, g: 0, b: 0, a: T.shadowAlpha },
    offset: { x: 0, y: 2 },
    radius: 8,
    spread: 0,
    visible: true,
    blendMode: 'NORMAL'
  };
}

// Automático: usa o tema escuro quando o fundo da página é escuro
function resolveTheme(choice) {
  if (choice === 'light' || choice === 'dark') return THEMES[choice];
  try {
    const bg = figma.currentPage.backgrounds.find(function (p) {
      return p.type === 'SOLID' && p.visible !== false;
    });
    if (bg && luminance(bg.color) < 0.4) return THEMES.dark;
  } catch (e) {}
  return THEMES.light;
}

const DEFAULTS = {
  scope: 'page',
  side: 'auto',
  theme: 'auto',
  cardWidth: 320,
  showProps: true,
  highlight: true,
  lines: true,
  lock: true,
  live: true,
  lang: 'auto'
};
const STORAGE_KEY = 'a4a-options';

let currentLang = 'pt';

function getRelaunchData() {
  return {
    update: currentLang === 'pt'
      ? 'Reposiciona e atualiza os cards de annotations'
      : 'Reposition and update annotation cards'
  };
}

let currentScope = 'page';
let options = Object.assign({}, DEFAULTS);

// ---------------------------------------------------------------------------
// Início: interface ou botão "Annotations for all" do painel lateral
// ---------------------------------------------------------------------------

if (figma.command === 'update') {
  runRelaunch();
} else {
  openUI();
}

async function loadOptions() {
  const saved = await figma.clientStorage.getAsync(STORAGE_KEY);
  options = Object.assign({}, DEFAULTS, saved || {});
  if (options.lang === 'pt' || options.lang === 'en') {
    currentLang = options.lang;
  }
  return options;
}

// Atualiza sem abrir a interface. Com algo selecionado, atualiza só as telas
// envolvidas; sem seleção, atualiza a página inteira.
async function runRelaunch() {
  try {
    await loadOptions();
    const ids = new Set();
    for (const n of figma.currentPage.selection) {
      const m = mirrorRoot(n);
      ids.add(m ? m.getPluginData(TAG) : anchorOf(n).id);
    }
    const res = ids.size
      ? await refreshAnchors(Array.from(ids), options)
      : await render(collect('page'), options, { all: true, focus: false });
    figma.closePlugin(resultText(res));
  } catch (e) {
    figma.closePlugin((currentLang === 'pt' ? 'Não deu certo: ' : 'Something went wrong: ') + errorText(e));
  }
}

function openUI() {
  figma.showUI(__html__, { width: 360, height: 620, themeColors: true });
  loadOptions().then(async function (opts) {
    currentScope = opts.scope;
    if (opts.lang === 'pt' || opts.lang === 'en') {
      currentLang = opts.lang;
    }
    figma.ui.postMessage({ type: 'init', options: opts });
    postCount();
    setLive(opts.live);
    if (opts.live !== false) {
      await autoRefreshExisting(opts);
    }
  });
  figma.on('selectionchange', function () {
    if (currentScope === 'selection') postCount();
  });
  figma.on('currentpagechange', function () {
    postCount();
    if (options.live) {
      setLive(true);
      autoRefreshExisting(options);
    }
  });
  figma.ui.onmessage = onMessage;
}

async function onMessage(msg) {
  try {
    if (msg.type === 'set-lang') {
      currentLang = msg.lang === 'en' ? 'en' : 'pt';
      options.lang = currentLang;
      await figma.clientStorage.setAsync(STORAGE_KEY, options);
    } else if (msg.type === 'count') {
      currentScope = msg.scope;
      postCount();
    } else if (msg.type === 'generate') {
      options = Object.assign({}, DEFAULTS, msg.options);
      if (options.lang === 'pt' || options.lang === 'en') {
        currentLang = options.lang;
      }
      await figma.clientStorage.setAsync(STORAGE_KEY, options);
      setLive(options.live);
      const res = await withRendering(function () {
        return render(collect(options.scope), options, { all: options.scope === 'page', focus: true });
      });
      const text = resultText(res);
      figma.notify(text);
      figma.ui.postMessage({ type: 'done', text: text });
      postCount();
    } else if (msg.type === 'live') {
      options.live = !!msg.on;
      await figma.clientStorage.setAsync(STORAGE_KEY, options);
      setLive(options.live);
      if (options.live) {
        await autoRefreshExisting(options);
      }
      figma.ui.postMessage({
        type: 'done',
        text: currentLang === 'pt'
          ? (options.live ? 'Atualização automática ligada.' : 'Atualização automática desligada.')
          : (options.live ? 'Automatic updates turned on.' : 'Automatic updates turned off.')
      });
    } else if (msg.type === 'clear') {
      const removed = await withRendering(function () { return removeMirrors(null); });
      const text = removed === 0
        ? (currentLang === 'pt' ? 'Não há camadas geradas nesta página.' : 'No generated layers on this page.')
        : (currentLang === 'pt'
            ? removed + (removed === 1 ? ' grupo removido.' : ' grupos removidos.')
            : removed + (removed === 1 ? ' group removed.' : ' groups removed.'));
      figma.notify(text);
      figma.ui.postMessage({ type: 'done', text: text });
      postCount();
    }
  } catch (e) {
    console.error(e);
    figma.ui.postMessage({ type: 'error', text: errorText(e) });
  }
}

function postCount() {
  const nodes = collect(currentScope);
  let annotations = 0;
  for (const n of nodes) annotations += n.annotations.length;
  figma.ui.postMessage({ type: 'count', nodes: nodes.length, annotations: annotations, scope: currentScope });
}

function resultText(res) {
  if (res.annotations === 0) {
    return currentLang === 'pt' ? 'Nenhuma annotation encontrada.' : 'No annotations found.';
  }
  if (currentLang === 'pt') {
    return res.annotations + (res.annotations === 1 ? ' annotation atualizada' : ' annotations atualizadas') +
      ' em ' + res.groups + (res.groups === 1 ? ' tela.' : ' telas.');
  }
  return res.annotations + (res.annotations === 1 ? ' annotation updated' : ' annotations updated') +
    ' across ' + res.groups + (res.groups === 1 ? ' frame.' : ' frames.');
}

function errorText(e) {
  return e && e.message ? e.message : String(e);
}

// ---------------------------------------------------------------------------
// Modo ao vivo: enquanto o plugin está aberto, acompanha mudanças na página
// ---------------------------------------------------------------------------

const WATCH = [
  'x', 'y', 'width', 'height', 'relativeTransform', 'transform',
  'absoluteTransform', 'rotation', 'parent', 'visible', 'annotations'
];
let livePage = null;
let liveTimer = null;
let rendering = false;
const dirty = new Set();
let watchedAnchors = new Set();
let watchedNodes = new Map(); // elemento anotado → tela

// Reposiciona automaticamente espelhos existentes na página
async function autoRefreshExisting(opts) {
  const mirrors = findMirrors();
  if (!mirrors.length) return;
  const anchorIds = new Set();
  for (const m of mirrors) {
    const aid = m.getPluginData(TAG);
    if (aid) anchorIds.add(aid);
  }
  if (!anchorIds.size) return;
  try {
    await withRendering(function () {
      return refreshAnchors(Array.from(anchorIds), opts || options);
    });
    postCount();
  } catch (e) {
    console.error('Auto-refresh error:', e);
  }
}

function setLive(on) {
  if (livePage) {
    livePage.off('nodechange', onNodeChange);
    livePage = null;
  }
  if (on) {
    livePage = figma.currentPage;
    livePage.on('nodechange', onNodeChange);
    scanWatched();
  }
}

// Mapeia quais telas já têm cards e quais elementos anotados pertencem a elas
function scanWatched() {
  watchedAnchors = new Set();
  watchedNodes = new Map();
  for (const m of findMirrors()) watchedAnchors.add(m.getPluginData(TAG));
  for (const n of collect('page')) {
    const a = anchorOf(n).id;
    if (watchedAnchors.has(a)) watchedNodes.set(n.id, a);
  }
}

function onNodeChange(event) {
  if (rendering) return;
  for (const c of event.nodeChanges) {
    if (c.type === 'DELETE') {
      if (watchedAnchors.has(c.id)) {
        dirty.add(c.id);
      } else {
        const a = watchedNodes.get(c.id);
        if (a) dirty.add(a);
      }
      continue;
    }
    const node = c.node;
    if (!node || node.removed || isMirror(node)) continue;
    if (c.type === 'CREATE') {
      if (hasAnn(node)) markAnchor(node, true);
      continue;
    }
    const props = c.properties || [];
    if (!props.some(function (p) { return WATCH.indexOf(p) !== -1; })) continue;
    markAnchor(node, props.indexOf('annotations') !== -1);
  }
  if (dirty.size) {
    if (liveTimer) clearTimeout(liveTimer);
    liveTimer = setTimeout(flushLive, 300);
  }
}

function markAnchor(node, annotationsChanged) {
  // Seções levam os cards junto quando se movem, não precisa refazer
  if (node.type === 'PAGE' || node.type === 'SECTION' || node.type === 'DOCUMENT') return;
  const a = anchorOf(node);
  if (watchedAnchors.has(a.id) || annotationsChanged) dirty.add(a.id);
}

async function flushLive() {
  liveTimer = null;
  if (rendering) {
    liveTimer = setTimeout(flushLive, 300);
    return;
  }
  const ids = Array.from(dirty);
  dirty.clear();
  if (!ids.length) return;
  try {
    await withRendering(function () { return refreshAnchors(ids, options); });
  } catch (e) {
    console.error(e);
  }
  postCount();
}

// Ignora os próprios eventos do plugin enquanto ele desenha os cards
async function withRendering(fn) {
  rendering = true;
  try {
    return await fn();
  } finally {
    // Os eventos chegam depois da mudança, então libera no próximo ciclo
    await new Promise(function (resolve) { setTimeout(resolve, 0); });
    rendering = false;
    if (livePage) scanWatched();
  }
}

// ---------------------------------------------------------------------------
// Coleta
// ---------------------------------------------------------------------------

function hasAnn(n) {
  try {
    return 'annotations' in n && n.annotations && n.annotations.length > 0;
  } catch (e) {
    return false;
  }
}

function mirrorRoot(n) {
  for (let p = n; p && p.type !== 'PAGE' && p.type !== 'DOCUMENT'; p = p.parent) {
    if (p.getPluginData(TAG)) return p;
  }
  return null;
}

function isMirror(n) {
  return !!mirrorRoot(n);
}

function isVisible(n) {
  for (let p = n; p && p.type !== 'PAGE'; p = p.parent) {
    if (p.visible === false) return false;
  }
  return true;
}

function collect(scope) {
  return collectFrom(scope === 'selection' ? figma.currentPage.selection : figma.currentPage.children);
}

function collectFrom(roots) {
  figma.skipInvisibleInstanceChildren = true;
  const seen = new Set();
  const out = [];
  const push = function (n) {
    if (!seen.has(n.id) && isVisible(n)) {
      seen.add(n.id);
      out.push(n);
    }
  };
  for (const r of roots) {
    if (isMirror(r)) continue;
    if (hasAnn(r)) push(r);
    if ('findAll' in r) {
      for (const n of r.findAll(hasAnn)) push(n);
    }
  }
  return out;
}

// Tela "raiz" do elemento: o ancestral que está direto na página ou numa seção
function anchorOf(n) {
  let a = n;
  while (a.parent && a.parent.type !== 'PAGE' && a.parent.type !== 'SECTION') a = a.parent;
  return a;
}

function box(n) {
  if (n.absoluteBoundingBox) return n.absoluteBoundingBox;
  return { x: n.absoluteTransform[0][2], y: n.absoluteTransform[1][2], width: n.width, height: n.height };
}

function origin(container) {
  if (container.type === 'PAGE') return { x: 0, y: 0 };
  return { x: container.absoluteTransform[0][2], y: container.absoluteTransform[1][2] };
}

function findMirrors() {
  return figma.currentPage.findAllWithCriteria({ pluginData: { keys: [TAG] } });
}

async function removeMirrors(anchorIds) {
  let removed = 0;
  for (const m of findMirrors()) {
    if (m.removed) continue;
    const anchorId = m.getPluginData(TAG);
    if (!anchorIds || anchorIds.has(anchorId)) {
      m.locked = false;
      m.remove();
      removed++;
      if (!anchorIds) {
        // Limpando tudo: tira também o botão "Annotations for all" das telas
        try {
          const a = await figma.getNodeByIdAsync(anchorId);
          if (a && !a.removed) a.setRelaunchData({});
        } catch (e) {}
      }
    }
  }
  if (!anchorIds) figma.currentPage.setRelaunchData({});
  return removed;
}

// ---------------------------------------------------------------------------
// Geração
// ---------------------------------------------------------------------------

async function refreshAnchors(ids, opts) {
  const anchors = [];
  for (const id of ids) {
    const n = await figma.getNodeByIdAsync(id);
    if (n && !n.removed) anchors.push(n);
  }
  return render(collectFrom(anchors), opts, { anchorIds: new Set(ids), focus: false });
}

async function render(nodes, opts, mode) {
  await Promise.all(FONT_STYLES.map(function (style) {
    return figma.loadFontAsync({ family: FONT, style: style });
  }));
  T = resolveTheme(opts.theme);
  const cats = await loadCategories();

  const byAnchor = new Map();
  for (const n of nodes) {
    const a = anchorOf(n);
    if (!byAnchor.has(a.id)) byAnchor.set(a.id, { anchor: a, nodes: [] });
    byAnchor.get(a.id).nodes.push(n);
  }

  // Remove versões anteriores antes de gerar de novo (inclusive de telas que
  // ficaram sem annotations)
  const ids = new Set(mode.anchorIds || []);
  for (const k of byAnchor.keys()) ids.add(k);
  await removeMirrors(mode.all ? null : ids);

  const groups = [];
  let total = 0;
  for (const entry of byAnchor.values()) {
    const res = await buildForAnchor(entry.anchor, entry.nodes, cats, opts);
    groups.push(res.group);
    total += res.count;
  }

  if (groups.length) figma.currentPage.setRelaunchData(getRelaunchData());
  if (mode.focus && groups.length) {
    figma.currentPage.selection = groups;
    figma.viewport.scrollAndZoomIntoView(groups);
  }
  return { groups: groups.length, annotations: total };
}

async function loadCategories() {
  const map = {};
  try {
    const list = await figma.annotations.getAnnotationCategoriesAsync();
    for (const c of list) {
      map[c.id] = { label: c.label, color: CATEGORY_COLORS[c.color] || DEFAULT_COLOR };
    }
  } catch (e) {
    // Sem categorias: segue com a cor padrão
  }
  return map;
}

async function buildForAnchor(anchor, nodes, cats, opts) {
  const container = anchor.parent;
  const o = origin(container);
  const ab = box(anchor);

  nodes.sort(function (a, b) {
    const A = box(a);
    const B = box(b);
    return (A.y - B.y) || (A.x - B.x);
  });

  const items = [];
  for (const node of nodes) {
    const total = node.annotations.length;
    node.annotations.forEach(function (ann, i) {
      items.push({ node: node, ann: ann, slot: i, total: total });
    });
  }

  const BASE_GAP = 96;     // distância mínima entre a tela e a coluna de cards
  const CARD_GAP = 16;     // espaço entre cards
  const LANE = 10;         // distância entre as faixas verticais das linhas
  const LANE_PAD = 24;     // margem das faixas em relação à tela e ao card
  const TRACK = 8;         // distância mínima entre linhas horizontais
  const CARD_ANCHOR = 29;  // altura do marcador dentro do card (barra + padding + metade do marcador)

  const anchorCenter = ab.x + ab.width / 2;
  const place = function (n, x, y) {
    n.x = x - o.x;
    n.y = y - o.y;
  };

  const highlights = [];
  const lines = [];
  const cards = [];
  const badges = [];
  const highlighted = new Set();
  const cursor = { right: ab.y, left: ab.y };
  const routes = { right: [], left: [] };

  // 1ª etapa: cards, destaques e marcadores
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const node = item.node;
    const num = i + 1;
    const cat = item.ann.categoryId ? cats[item.ann.categoryId] : null;
    const color = cat ? cat.color : DEFAULT_COLOR;
    const nb = box(node);

    // Lado: o mais próximo do elemento (automático) ou o escolhido na interface
    let side;
    if (opts.side === 'right' || opts.side === 'left') side = opts.side;
    else side = nb.x + nb.width / 2 >= anchorCenter ? 'right' : 'left';

    const card = await buildCard(num, item, cat, color, anchor, opts);
    container.appendChild(card);
    const cardY = Math.max(nb.y, cursor[side]);
    cursor[side] = cardY + card.height + CARD_GAP;
    cards.push({ node: card, side: side, y: cardY });

    if (opts.highlight && !highlighted.has(node.id)) {
      highlighted.add(node.id);
      const h = buildHighlight(nb, color, node.name);
      container.appendChild(h);
      place(h, nb.x, nb.y);
      highlights.push(h);
    }

    const badge = buildBadge(num, color);
    container.appendChild(badge);
    place(badge, nb.x - 11 + item.slot * 26, nb.y - 11);
    badges.push(badge);

    if (opts.lines) {
      routes[side].push({ num: num, color: color, nb: nb, slot: item.slot, total: item.total, y2: cardY + CARD_ANCHOR });
    }
  }

  // 2ª etapa: rotas das linhas, uma por lado
  const gap = { right: BASE_GAP, left: BASE_GAP };
  ['right', 'left'].forEach(function (side) {
    const list = routes[side];

    // Altura de saída: centro do elemento, separada quando o elemento tem várias
    // annotations ou quando outra linha já sai na mesma altura
    const usedY = [];
    for (const r of list) {
      let y1 = r.nb.y + r.nb.height / 2 + (r.slot - (r.total - 1) / 2) * TRACK;
      while (usedY.some(function (u) { return Math.abs(u - y1) < TRACK - 0.5; })) y1 += TRACK;
      usedY.push(y1);
      r.y1 = y1;
    }

    // Faixas verticais: quando os trechos verticais se cruzam no eixo Y, cada linha
    // ganha uma faixa própria. A mais antiga fica mais perto do card, o que evita cruzamentos.
    const assigned = [];
    let maxLane = -1;
    for (const r of list) {
      if (Math.abs(r.y2 - r.y1) < 1) {
        r.lane = -1; // linha reta, não precisa de faixa
        continue;
      }
      const top = Math.min(r.y1, r.y2) - TRACK;
      const bottom = Math.max(r.y1, r.y2) + TRACK;
      let lane = 0;
      for (const a of assigned) {
        if (a.bottom > top && a.top < bottom) lane = Math.max(lane, a.lane + 1);
      }
      r.lane = lane;
      assigned.push({ top: top, bottom: bottom, lane: lane });
      maxLane = Math.max(maxLane, lane);
    }
    gap[side] = Math.max(BASE_GAP, LANE_PAD * 2 + Math.max(0, maxLane) * LANE);
  });

  const columnX = function (side) {
    return side === 'right' ? ab.x + ab.width + gap.right : ab.x - gap.left - opts.cardWidth;
  };

  for (const c of cards) place(c.node, columnX(c.side), c.y);

  ['right', 'left'].forEach(function (side) {
    const right = side === 'right';
    const cx = columnX(side);
    for (const r of routes[side]) {
      const startX = right ? r.nb.x + r.nb.width : r.nb.x;
      const endX = right ? cx : cx + opts.cardWidth;
      let pts;
      if (r.lane < 0) {
        pts = [{ x: startX, y: r.y1 }, { x: endX, y: r.y2 }];
      } else {
        const laneX = right
          ? cx - LANE_PAD - r.lane * LANE
          : cx + opts.cardWidth + LANE_PAD + r.lane * LANE;
        pts = [{ x: startX, y: r.y1 }, { x: laneX, y: r.y1 }, { x: laneX, y: r.y2 }, { x: endX, y: r.y2 }];
      }
      const l = buildLine(pts, r.color, r.num);
      container.appendChild(l.node);
      place(l.node, l.x, l.y);
      lines.push(l.node);

      // Ponto no início da linha, para deixar claro de qual elemento ela sai
      const dot = figma.createEllipse();
      dot.name = (currentLang === 'pt' ? 'Origem #' : 'Origin #') + r.num;
      dot.resize(6, 6);
      dot.fills = [solid(r.color)];
      container.appendChild(dot);
      place(dot, startX - 3, r.y1 - 3);
      lines.push(dot);
    }
  });

  // Ordem das camadas: destaques, linhas, cards, marcadores (de baixo para cima)
  const all = [].concat(highlights, lines, cards.map(function (c) { return c.node; }), badges);
  const group = figma.group(all, container);
  for (const n of all) group.appendChild(n);
  group.name = '📝 Annotations · ' + anchor.name;
  group.setPluginData(TAG, anchor.id);
  group.expanded = false;
  group.locked = !!opts.lock;
  const relaunch = getRelaunchData();
  group.setRelaunchData(relaunch);
  try {
    anchor.setRelaunchData(relaunch);
  } catch (e) {}
  return { group: group, count: items.length };
}

// ---------------------------------------------------------------------------
// Peças visuais
// ---------------------------------------------------------------------------

async function buildCard(num, item, cat, color, anchor, opts) {
  const node = item.node;
  const ann = item.ann;

  const card = stack('#' + num + ' · ' + node.name, 'VERTICAL', 0);
  card.counterAxisSizingMode = 'FIXED';
  card.resize(opts.cardWidth, 100);
  card.primaryAxisSizingMode = 'AUTO';
  card.fills = [solid(T.surface)];
  card.strokes = [solid(T.border)];
  card.strokeWeight = 1;
  card.cornerRadius = 8;
  card.clipsContent = true;
  card.effects = [shadow()];

  const bar = figma.createRectangle();
  bar.name = currentLang === 'pt' ? 'Cor da categoria' : 'Category color';
  bar.fills = [solid(color)];
  bar.resize(opts.cardWidth, 4);
  card.appendChild(bar);
  bar.layoutSizingHorizontal = 'FILL';

  const body = stack(currentLang === 'pt' ? 'Conteúdo' : 'Content', 'VERTICAL', 12);
  pad(body, 14, 16);
  card.appendChild(body);
  body.layoutSizingHorizontal = 'FILL';

  // Cabeçalho: número + nome do elemento + caminho + categoria
  const head = stack(currentLang === 'pt' ? 'Elemento' : 'Element', 'HORIZONTAL', 10);
  body.appendChild(head);
  head.layoutSizingHorizontal = 'FILL';
  head.appendChild(buildBadge(num, color));

  const titles = stack(currentLang === 'pt' ? 'Títulos' : 'Titles', 'VERTICAL', 4);
  head.appendChild(titles);
  titles.layoutSizingHorizontal = 'FILL';

  const name = txt(node.name, 13, 'Semi Bold', T.ink);
  titles.appendChild(name);
  fillText(name);
  try {
    // Clicar no nome leva até o elemento anotado
    name.setRangeHyperlink(0, name.characters.length, { type: 'NODE', value: node.id });
  } catch (e) {}

  const crumb = breadcrumb(node, anchor);
  if (crumb) {
    const c = txt(crumb, 11, 'Regular', T.muted);
    titles.appendChild(c);
    fillText(c);
  }
  if (cat) titles.appendChild(buildChip(cat.label, color));

  // Texto da annotation
  let label = null;
  if (ann.labelMarkdown && ann.labelMarkdown.trim()) label = richText(ann.labelMarkdown.trim());
  else if (ann.label && ann.label.trim()) label = txt(ann.label.trim(), 12, 'Regular', T.ink);
  if (label) {
    body.appendChild(label);
    fillText(label);
  }

  // Propriedades fixadas na annotation, com os valores atuais do elemento
  const props = ann.properties || [];
  if (opts.showProps && props.length) {
    const table = stack(currentLang === 'pt' ? 'Propriedades' : 'Properties', 'VERTICAL', 6);
    table.paddingTop = 12;
    table.strokes = [solid(T.border)];
    table.strokeWeight = 0;
    table.strokeTopWeight = 1;
    body.appendChild(table);
    table.layoutSizingHorizontal = 'FILL';

    for (const p of props) {
      const resolved = await resolveProperty(node, p.type);
      const row = stack(resolved[0], 'HORIZONTAL', 8);
      table.appendChild(row);
      row.layoutSizingHorizontal = 'FILL';

      const l = txt(resolved[0], 11, 'Regular', T.muted);
      row.appendChild(l);
      l.resize(112, l.height);
      l.textAutoResize = 'HEIGHT';

      const v = txt(resolved[1], 11, 'Medium', T.ink);
      row.appendChild(v);
      fillText(v);
    }
  }

  return card;
}

function buildBadge(num, color) {
  const f = stack('#' + num, 'HORIZONTAL', 0);
  f.primaryAxisAlignItems = 'CENTER';
  f.counterAxisAlignItems = 'CENTER';
  f.counterAxisSizingMode = 'FIXED';
  f.resize(22, 22);
  f.primaryAxisSizingMode = 'AUTO';
  f.minWidth = 22;
  f.paddingLeft = 6;
  f.paddingRight = 6;
  f.cornerRadius = 11;
  f.fills = [solid(color)];
  f.strokes = [solid(T.surface)];
  f.strokeWeight = 2;
  f.strokeAlign = 'OUTSIDE';
  f.effects = [shadow()];
  f.appendChild(txt(String(num), 11, 'Bold', textOn(color)));
  return f;
}

function buildChip(label, color) {
  const c = stack(currentLang === 'pt' ? 'Categoria' : 'Category', 'HORIZONTAL', 6);
  c.counterAxisAlignItems = 'CENTER';
  pad(c, 3, 8);
  c.cornerRadius = 4;
  c.fills = [solid(color, T.chipAlpha)];
  const dot = figma.createEllipse();
  dot.name = currentLang === 'pt' ? 'Cor' : 'Color';
  dot.resize(6, 6);
  dot.fills = [solid(color)];
  c.appendChild(dot);
  c.appendChild(txt(label, 10, 'Semi Bold', T.ink));
  return c;
}

function buildHighlight(nb, color, name) {
  const r = figma.createRectangle();
  r.name = (currentLang === 'pt' ? 'Destaque · ' : 'Highlight · ') + name;
  r.resize(Math.max(1, nb.width), Math.max(1, nb.height));
  r.fills = [solid(color, T.highlightAlpha)];
  r.strokes = [solid(color)];
  r.strokeWeight = 1.5;
  r.strokeAlign = 'OUTSIDE';
  r.dashPattern = [4, 3];
  r.cornerRadius = 2;
  return r;
}

function buildLine(pts, color, num) {
  const minX = Math.min.apply(null, pts.map(function (p) { return p.x; }));
  const minY = Math.min.apply(null, pts.map(function (p) { return p.y; }));
  const data = pts.map(function (p, i) {
    return (i ? 'L ' : 'M ') + round(p.x - minX) + ' ' + round(p.y - minY);
  }).join(' ');
  const v = figma.createVector();
  v.name = (currentLang === 'pt' ? 'Linha #' : 'Line #') + num;
  v.vectorPaths = [{ windingRule: 'NONE', data: data }];
  v.fills = [];
  v.strokes = [solid(color)];
  v.strokeWeight = 1;
  v.dashPattern = [4, 4];
  return { node: v, x: minX, y: minY };
}

function breadcrumb(node, anchor) {
  const names = [];
  let p = node.parent;
  while (p && p.id !== anchor.id && p.type !== 'PAGE' && p.type !== 'SECTION') {
    names.unshift(p.name);
    p = p.parent;
  }
  if (anchor.id !== node.id) names.unshift(anchor.name);
  if (names.length > 3) names.splice(1, names.length - 3, '…');
  return names.join(' › ');
}

// ---------------------------------------------------------------------------
// Markdown simples: negrito, código, links, listas e títulos
// ---------------------------------------------------------------------------

function parseMarkdown(md) {
  let text = '';
  const bold = [];
  const code = [];
  const links = [];
  const lines = md.replace(/\r\n?/g, '\n').split('\n');

  lines.forEach(function (raw, li) {
    if (li) text += '\n';
    let line = raw;
    let heading = false;
    const h = line.match(/^\s*#{1,6}\s+(.*)$/);
    if (h) {
      line = h[1];
      heading = true;
    }
    line = line.replace(/^(\s*)[-*+]\s+/, '$1• ');

    const lineStart = text.length;
    const re = /\*\*(.+?)\*\*|__(.+?)__|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*([^*\s][^*]*)\*/g;
    let last = 0;
    let m;
    while ((m = re.exec(line))) {
      text += line.slice(last, m.index);
      const s = text.length;
      if (m[1] !== undefined || m[2] !== undefined) {
        text += m[1] !== undefined ? m[1] : m[2];
        bold.push([s, text.length]);
      } else if (m[3] !== undefined) {
        text += m[3];
        code.push([s, text.length]);
      } else if (m[4] !== undefined) {
        text += m[4];
        links.push([s, text.length, m[5]]);
      } else {
        text += m[6]; // itálico: só remove os marcadores
      }
      last = re.lastIndex;
    }
    text += line.slice(last);
    if (heading) bold.push([lineStart, text.length]);
  });

  return { text: text, bold: bold, code: code, links: links };
}

function richText(md) {
  const p = parseMarkdown(md);
  const t = txt(p.text, 12, 'Regular', T.ink);
  for (const r of p.bold) {
    if (r[1] > r[0]) t.setRangeFontName(r[0], r[1], { family: FONT, style: 'Bold' });
  }
  for (const r of p.code) {
    if (r[1] > r[0]) {
      t.setRangeFontName(r[0], r[1], { family: FONT, style: 'Medium' });
      t.setRangeFills(r[0], r[1], [solid(T.code)]);
    }
  }
  for (const r of p.links) {
    if (r[1] > r[0]) {
      t.setRangeFills(r[0], r[1], [solid(T.link)]);
      t.setRangeTextDecoration(r[0], r[1], 'UNDERLINE');
      if (/^https?:\/\//i.test(r[2])) {
        try {
          t.setRangeHyperlink(r[0], r[1], { type: 'URL', value: r[2] });
        } catch (e) {}
      }
    }
  }
  return t;
}

// ---------------------------------------------------------------------------
// Propriedades
// ---------------------------------------------------------------------------

const ALIGN = {
  pt: { MIN: 'Início', CENTER: 'Centro', MAX: 'Fim', SPACE_BETWEEN: 'Espaço entre', BASELINE: 'Linha de base' },
  en: { MIN: 'Start', CENTER: 'Center', MAX: 'End', SPACE_BETWEEN: 'Space between', BASELINE: 'Baseline' }
};
const TEXT_ALIGN = {
  pt: { LEFT: 'Esquerda', CENTER: 'Centro', RIGHT: 'Direita', JUSTIFIED: 'Justificado' },
  en: { LEFT: 'Left', CENTER: 'Center', RIGHT: 'Right', JUSTIFIED: 'Justified' }
};
const LAYOUT = {
  pt: { NONE: 'Nenhum', HORIZONTAL: 'Horizontal', VERTICAL: 'Vertical', GRID: 'Grade' },
  en: { NONE: 'None', HORIZONTAL: 'Horizontal', VERTICAL: 'Vertical', GRID: 'Grid' }
};
const EFFECT = {
  pt: {
    DROP_SHADOW: 'Sombra',
    INNER_SHADOW: 'Sombra interna',
    LAYER_BLUR: 'Desfoque',
    BACKGROUND_BLUR: 'Desfoque de fundo'
  },
  en: {
    DROP_SHADOW: 'Drop shadow',
    INNER_SHADOW: 'Inner shadow',
    LAYER_BLUR: 'Layer blur',
    BACKGROUND_BLUR: 'Background blur'
  }
};

const PROP_LABELS = {
  pt: {
    width: 'Largura',
    height: 'Altura',
    minWidth: 'Largura mín.',
    maxWidth: 'Largura máx.',
    minHeight: 'Altura mín.',
    maxHeight: 'Altura máx.',
    fills: 'Preenchimento',
    strokes: 'Borda',
    strokeWeight: 'Espessura da borda',
    effects: 'Efeitos',
    cornerRadius: 'Raio',
    opacity: 'Opacidade',
    textStyleId: 'Estilo de texto',
    fontFamily: 'Fonte',
    fontStyle: 'Estilo da fonte',
    fontSize: 'Tamanho da fonte',
    fontWeight: 'Peso',
    lineHeight: 'Altura da linha',
    letterSpacing: 'Espaçamento entre letras',
    textAlignHorizontal: 'Alinhamento do texto',
    layoutMode: 'Direção do layout',
    itemSpacing: 'Espaçamento (gap)',
    padding: 'Padding',
    alignItems: 'Alinhamento',
    mainComponent: 'Componente',
    gridRowGap: 'Gap entre linhas',
    gridColumnGap: 'Gap entre colunas',
    gridRowCount: 'Linhas da grade',
    gridColumnCount: 'Colunas da grade'
  },
  en: {
    width: 'Width',
    height: 'Height',
    minWidth: 'Min width',
    maxWidth: 'Max width',
    minHeight: 'Min height',
    maxHeight: 'Max height',
    fills: 'Fill',
    strokes: 'Stroke',
    strokeWeight: 'Stroke weight',
    effects: 'Effects',
    cornerRadius: 'Corner radius',
    opacity: 'Opacity',
    textStyleId: 'Text style',
    fontFamily: 'Font',
    fontStyle: 'Font style',
    fontSize: 'Font size',
    fontWeight: 'Weight',
    lineHeight: 'Line height',
    letterSpacing: 'Letter spacing',
    textAlignHorizontal: 'Text alignment',
    layoutMode: 'Layout direction',
    itemSpacing: 'Item spacing (gap)',
    padding: 'Padding',
    alignItems: 'Alignment',
    mainComponent: 'Component',
    gridRowGap: 'Row gap',
    gridColumnGap: 'Column gap',
    gridRowCount: 'Grid rows',
    gridColumnCount: 'Grid columns'
  }
};

const PROPERTIES = {
  width: function (n) { return withVar(n, 'width', px(n.width)); },
  height: function (n) { return withVar(n, 'height', px(n.height)); },
  minWidth: function (n) { return withVar(n, 'minWidth', px(n.minWidth)); },
  maxWidth: function (n) { return withVar(n, 'maxWidth', px(n.maxWidth)); },
  minHeight: function (n) { return withVar(n, 'minHeight', px(n.minHeight)); },
  maxHeight: function (n) { return withVar(n, 'maxHeight', px(n.maxHeight)); },
  fills: function (n) { return paintsText(n, 'fills', 'fillStyleId'); },
  strokes: function (n) { return paintsText(n, 'strokes', 'strokeStyleId'); },
  strokeWeight: function (n) { return withVar(n, 'strokeWeight', px(n.strokeWeight)); },
  effects: effectsText,
  cornerRadius: radiusText,
  opacity: function (n) { return withVar(n, 'opacity', pct(n.opacity)); },
  textStyleId: textStyleText,
  fontFamily: function (n) { return fontPart(n, 'family'); },
  fontStyle: function (n) { return fontPart(n, 'style'); },
  fontSize: function (n) { return withVar(n, 'fontSize', px(n.fontSize)); },
  fontWeight: function (n) { return withVar(n, 'fontWeight', plain(n.fontWeight)); },
  lineHeight: function (n) { return withVar(n, 'lineHeight', unitText(n.lineHeight)); },
  letterSpacing: function (n) { return withVar(n, 'letterSpacing', unitText(n.letterSpacing)); },
  textAlignHorizontal: function (n) {
    const dict = TEXT_ALIGN[currentLang] || TEXT_ALIGN.pt;
    return dict[n.textAlignHorizontal] || '-';
  },
  layoutMode: function (n) {
    const dict = LAYOUT[currentLang] || LAYOUT.pt;
    return dict[n.layoutMode] || '-';
  },
  itemSpacing: function (n) { return withVar(n, 'itemSpacing', px(n.itemSpacing)); },
  padding: paddingText,
  alignItems: function (n) {
    const dict = ALIGN[currentLang] || ALIGN.pt;
    const pri = dict[n.primaryAxisAlignItems] || '-';
    const cnt = dict[n.counterAxisAlignItems] || '-';
    return currentLang === 'pt' ? 'Principal: ' + pri + ' · Cruzado: ' + cnt : 'Primary: ' + pri + ' · Counter: ' + cnt;
  },
  mainComponent: componentText,
  gridRowGap: function (n) { return withVar(n, 'gridRowGap', px(n.gridRowGap)); },
  gridColumnGap: function (n) { return withVar(n, 'gridColumnGap', px(n.gridColumnGap)); },
  gridRowCount: function (n) { return plain(n.gridRowCount); },
  gridColumnCount: function (n) { return plain(n.gridColumnCount); }
};

async function resolveProperty(node, type) {
  const handler = PROPERTIES[type];
  const labels = PROP_LABELS[currentLang] || PROP_LABELS.pt;
  const label = labels[type] || type;
  try {
    if (handler) return [label, await handler(node)];
    const v = node[type];
    return [label, (typeof v === 'number' || typeof v === 'string') ? String(v) : '-'];
  } catch (e) {
    return [label, '-'];
  }
}

async function varName(node, field) {
  try {
    const b = node.boundVariables && node.boundVariables[field];
    const alias = Array.isArray(b) ? b[0] : b;
    if (!alias || !alias.id) return null;
    const v = await figma.variables.getVariableByIdAsync(alias.id);
    return v ? v.name : null;
  } catch (e) {
    return null;
  }
}

async function withVar(node, field, base) {
  const name = await varName(node, field);
  return name ? name + ' · ' + base : base;
}

async function styleName(id) {
  if (!id || typeof id !== 'string') return null;
  try {
    const s = await figma.getStyleByIdAsync(id);
    return s ? s.name : null;
  } catch (e) {
    return null;
  }
}

async function textStyleText(n) {
  if (n.textStyleId === figma.mixed) return currentLang === 'pt' ? 'Misto' : 'Mixed';
  return (await styleName(n.textStyleId)) || (currentLang === 'pt' ? 'Nenhum' : 'None');
}

async function paintsText(node, field, styleField) {
  const sName = await styleName(node[styleField]);
  const paints = node[field];
  const mixedLabel = currentLang === 'pt' ? 'Misto' : 'Mixed';
  const noneLabel = currentLang === 'pt' ? 'Nenhum' : 'None';
  if (paints === figma.mixed) return sName || mixedLabel;
  if (!paints || !paints.length) return sName || noneLabel;
  const parts = [];
  for (const p of paints) {
    if (p.visible === false) continue;
    if (p.type === 'SOLID') {
      let vName = null;
      if (p.boundVariables && p.boundVariables.color) {
        try {
          const v = await figma.variables.getVariableByIdAsync(p.boundVariables.color.id);
          vName = v ? v.name : null;
        } catch (e) {}
      }
      let hex = toHex(p.color);
      if (p.opacity !== undefined && p.opacity < 1) hex += ' ' + pct(p.opacity);
      parts.push(vName ? vName + ' · ' + hex : hex);
    } else if (p.type.indexOf('GRADIENT') === 0) {
      parts.push(currentLang === 'pt' ? 'Gradiente' : 'Gradient');
    } else if (p.type === 'IMAGE') {
      parts.push(currentLang === 'pt' ? 'Imagem' : 'Image');
    } else {
      parts.push(p.type);
    }
  }
  const joined = parts.join(', ') || noneLabel;
  return sName ? sName + ' · ' + joined : joined;
}

async function effectsText(n) {
  const sName = await styleName(n.effectStyleId);
  const noneLabel = currentLang === 'pt' ? 'Nenhum' : 'None';
  if (!n.effects || !n.effects.length) return sName || noneLabel;
  const dict = EFFECT[currentLang] || EFFECT.pt;
  const parts = n.effects.filter(function (e) { return e.visible !== false; }).map(function (e) {
    const label = dict[e.type] || e.type;
    if (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW') {
      return label + ' ' + round(e.offset.x) + ' ' + round(e.offset.y) + ' ' + round(e.radius) + ' ' +
        round(e.spread || 0) + ' ' + toHex(e.color) + ' ' + pct(e.color.a);
    }
    if (e.radius !== undefined) return label + ' ' + round(e.radius);
    return label;
  });
  const joined = parts.join(', ') || noneLabel;
  return sName ? sName + ' · ' + joined : joined;
}

async function radiusText(n) {
  if (!('cornerRadius' in n)) return '-';
  if (n.cornerRadius !== figma.mixed) return withVar(n, 'topLeftRadius', px(n.cornerRadius));
  return [n.topLeftRadius, n.topRightRadius, n.bottomRightRadius, n.bottomLeftRadius].map(px).join(' ');
}

async function paddingText(n) {
  if (!('paddingTop' in n)) return '-';
  const sides = ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'];
  const labels = currentLang === 'pt' ? ['topo', 'direita', 'base', 'esquerda'] : ['top', 'right', 'bottom', 'left'];
  const vals = sides.map(function (s) { return n[s]; });
  const names = await Promise.all(sides.map(function (s) { return varName(n, s); }));
  const same = vals.every(function (v) { return v === vals[0]; }) && names.every(function (x) { return x === names[0]; });
  if (same) return names[0] ? names[0] + ' · ' + px(vals[0]) : px(vals[0]);
  return sides.map(function (s, i) {
    return labels[i] + ' ' + (names[i] ? names[i] + ' (' + px(vals[i]) + ')' : px(vals[i]));
  }).join(', ');
}

async function componentText(n) {
  if (n.type === 'COMPONENT') return n.name;
  if (n.type !== 'INSTANCE') return '-';
  const main = await n.getMainComponentAsync();
  if (!main) return currentLang === 'pt' ? 'Componente não encontrado' : 'Component not found';
  if (main.parent && main.parent.type === 'COMPONENT_SET') return main.parent.name + ' · ' + main.name;
  return main.name;
}

function fontPart(n, key) {
  if (!('fontName' in n)) return '-';
  if (n.fontName === figma.mixed) return currentLang === 'pt' ? 'Misto' : 'Mixed';
  return n.fontName[key];
}

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

function stack(name, dir, gap) {
  const f = figma.createFrame();
  f.name = name;
  f.layoutMode = dir;
  f.itemSpacing = gap || 0;
  f.fills = [];
  f.primaryAxisSizingMode = 'AUTO';
  f.counterAxisSizingMode = 'AUTO';
  f.clipsContent = false;
  return f;
}

function pad(f, v, h) {
  f.paddingTop = v;
  f.paddingBottom = v;
  f.paddingLeft = h;
  f.paddingRight = h;
}

function txt(chars, size, style, color) {
  const t = figma.createText();
  t.fontName = { family: FONT, style: style };
  t.fontSize = size;
  t.lineHeight = { unit: 'PERCENT', value: 140 };
  t.characters = chars && chars.length ? chars : ' ';
  t.fills = [solid(color)];
  return t;
}

function fillText(t) {
  t.layoutSizingHorizontal = 'FILL';
  t.textAutoResize = 'HEIGHT';
}

function rgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255
  };
}

function solid(hex, opacity) {
  const p = { type: 'SOLID', color: rgb(hex) };
  if (opacity !== undefined) p.opacity = opacity;
  return p;
}

function luminance(c) {
  const lin = function (v) { return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

// Texto escuro em cores claras (ex.: amarelo), branco nas demais
function textOn(hex) {
  return luminance(rgb(hex)) > 0.35 ? BADGE_DARK : BADGE_LIGHT;
}

function toHex(c) {
  const f = function (v) {
    const s = Math.round(v * 255).toString(16);
    return s.length === 1 ? '0' + s : s;
  };
  return ('#' + f(c.r) + f(c.g) + f(c.b)).toUpperCase();
}

function round(v) {
  return Math.round(v * 100) / 100;
}

function px(v) {
  if (v === figma.mixed) return currentLang === 'pt' ? 'Misto' : 'Mixed';
  if (v === null || v === undefined) return '-';
  return round(v) + 'px';
}

function pct(v) {
  if (v === figma.mixed) return currentLang === 'pt' ? 'Misto' : 'Mixed';
  if (v === null || v === undefined) return '-';
  return Math.round(v * 100) + '%';
}

function plain(v) {
  if (v === figma.mixed) return currentLang === 'pt' ? 'Misto' : 'Mixed';
  if (v === null || v === undefined) return '-';
  return String(v);
}

function unitText(v) {
  if (v === figma.mixed) return currentLang === 'pt' ? 'Misto' : 'Mixed';
  if (!v) return '-';
  if (v.unit === 'AUTO') return 'Auto';
  if (v.unit === 'PIXELS') return round(v.value) + 'px';
  if (v.unit === 'PERCENT') return round(v.value) + '%';
  return String(v.value);
}
