require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const crypto = require('crypto');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const { Telegraf, Markup } = require('telegraf');

const PORT = Number(process.env.PORT || 3000);
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const SUPPORT_BOT_TOKEN = process.env.SUPPORT_BOT_TOKEN || '';
const STORAGE_MODE = String(process.env.STORAGE_MODE || 'supabase').trim().toLowerCase();
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || 'sn-shop';
const OWNER_USERNAMES = (process.env.OWNER_USERNAMES || '')
  .split(',')
  .map((v) => v.trim().replace(/^@/, ''))
  .filter(Boolean);
const ADMIN_USERNAMES = (process.env.ADMIN_USERNAMES || '')
  .split(',')
  .map((v) => v.trim().replace(/^@/, ''))
  .filter(Boolean);
const STORE_CHANNELS = {
  tripshop: process.env.TRIPSHOP_CHANNEL_ID || '',
  limbpl: process.env.LIMBPL_CHANNEL_ID || '',
  triptoys: process.env.TRIPTOYS_CHANNEL_ID || '',
  tripchinashop: process.env.TRIPCHINASHOP_CHANNEL_ID || ''
};

const app = express();
app.use(cors());
app.use(express.json({ limit: '16mb' }));
app.use(express.urlencoded({ extended: true, limit: '16mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const supabaseEnabled = STORAGE_MODE === 'supabase' && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY;
const supabase = supabaseEnabled
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

const dataDir = path.join(__dirname, 'data');
const uploadsDir = path.join(__dirname, 'uploads');
const dataFile = path.join(dataDir, 'store.json');
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadsDir, { recursive: true });

const storeMeta = {
  tripshop: { key: 'tripshop', title: 'TripShop', subtitle: 'Магазин одежды', icon: '👕', theme: 'fashion' },
  limbpl: { key: 'limbpl', title: 'LimbPL', subtitle: 'Магазин плагинов Minecraft', icon: '🧩', theme: 'minecraft' },
  triptoys: { key: 'triptoys', title: 'TripToys', subtitle: 'Магазин игрушек', icon: '🧸', theme: 'toys' },
  tripchinashop: { key: 'tripchinashop', title: 'TripChinaShop', subtitle: 'Заказы с Китая', icon: '📦', theme: 'china' }
};

const defaultData = {
  sellers: [{ username: 'LimbPL', displayName: 'LimbPL', createdAt: new Date().toISOString() }],
  supportAgents: [],
  categories: [
    { id: 1, store: 'tripshop', name: 'Футболки', slug: 'tshirts', createdBy: 'system' },
    { id: 2, store: 'tripshop', name: 'Худи', slug: 'hoodies', createdBy: 'system' },
    { id: 3, store: 'tripshop', name: 'Штаны', slug: 'pants', createdBy: 'system' },
    { id: 4, store: 'limbpl', name: 'Плагины', slug: 'plugins', createdBy: 'system' },
    { id: 5, store: 'triptoys', name: 'Мягкие игрушки', slug: 'soft', createdBy: 'system' },
    { id: 6, store: 'tripchinashop', name: 'Электроника', slug: 'electronics', createdBy: 'system' }
  ],
  products: [
    {
      id: 1,
      store: 'tripshop',
      categorySlug: 'pants',
      title: 'TripPants Urban Black',
      slug: 'trip-pants-urban-black',
      shortDescription: 'Стильные чёрные штаны для повседневного образа.',
      fullDescription: 'Плотная ткань, комфортная посадка и лаконичный городской стиль. Для заказа просто открой контакт продавца и договорись в личке.',
      price: 1299,
      sellerUsername: 'LimbPL',
      sellerContact: 'https://t.me/LimbPL',
      sellerLabel: '@LimbPL',
      mainImage: 'https://images.unsplash.com/photo-1506629905607-d9d6c1f71941?auto=format&fit=crop&w=1200&q=80',
      gallery: [
        'https://images.unsplash.com/photo-1506629905607-d9d6c1f71941?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1523398002811-999ca8dec234?auto=format&fit=crop&w=1200&q=80'
      ],
      badges: ['Хит', 'Новый'],
      type: 'physical',
      createdAt: new Date().toISOString()
    },
    {
      id: 2,
      store: 'limbpl',
      categorySlug: 'plugins',
      title: 'LimbBuyer - плагин продаж для 1.21.1+',
      slug: 'limbbuyer-1211',
      shortDescription: 'Продажа лута, ресурсов и предметов через красивый интерфейс.',
      fullDescription: 'Готовый плагин магазина с категориями, карточками товара и настройкой продавцов. Оплата и выдача обсуждаются напрямую в личных сообщениях.',
      price: 1299,
      sellerUsername: 'LimbPL',
      sellerContact: 'https://t.me/LimbPL',
      sellerLabel: '@LimbPL',
      mainImage: '/assets/limbbuyer-demo.png',
      gallery: ['/assets/limbbuyer-demo.png'],
      badges: ['Хит', 'Рекомендуем'],
      type: 'file',
      createdAt: new Date().toISOString()
    }
  ],
  supportTickets: [],
  lastIds: { category: 6, product: 2, ticket: 0, message: 0 }
};

function ensureDataFile() {
  if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(dataFile, JSON.stringify(defaultData, null, 2), 'utf8');
  }
}
ensureDataFile();

function normalizeUsername(raw) {
  return String(raw || '').trim().replace(/^@/, '');
}
function isOwner(username) {
  return OWNER_USERNAMES.includes(normalizeUsername(username));
}
function isAdmin(username) {
  return isOwner(username) || ADMIN_USERNAMES.includes(normalizeUsername(username));
}
function slugify(value) {
  const base = String(value || '').trim().toLowerCase()
    .replace(/[а-яё]/gi, (ch) => ({ а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'c',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya' })[ch.toLowerCase()] || '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || crypto.randomUUID().slice(0, 8);
}
function normalizeSellerContact(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (/^https?:\/\/t\.me\//i.test(value)) return value;
  if (/^t\.me\//i.test(value)) return 'https://' + value;
  if (/^@/.test(value)) return 'https://t.me/' + value.slice(1);
  return value;
}
function cleanImages(existingGallery = [], uploaded = []) {
  return [...existingGallery.filter(Boolean), ...uploaded.filter(Boolean)].slice(0, 10);
}
function safeBadges(list) {
  return (Array.isArray(list) ? list : []).map((v) => String(v).trim()).filter(Boolean).slice(0, 3);
}
function hydrateData(data) {
  data.sellers ||= [];
  data.supportAgents ||= [];
  data.products ||= [];
  data.categories ||= [];
  data.supportTickets ||= [];
  data.lastIds ||= { category: 0, product: 0, ticket: 0, message: 0 };
  data.lastIds.ticket ||= 0;
  data.lastIds.message ||= 0;
  return data;
}
async function readData() {
  ensureDataFile();
  return hydrateData(JSON.parse(await fsp.readFile(dataFile, 'utf8')));
}
async function writeData(data) {
  await fsp.writeFile(dataFile, JSON.stringify(hydrateData(data), null, 2), 'utf8');
}

async function getDbRoleRows(role) {
  if (!supabaseEnabled) return [];
  try {
    const { data, error } = await supabase
      .from('user_roles')
      .select('username, role, created_at')
      .eq('role', role);
    if (error) {
      console.error('Role DB read error:', error.message);
      return [];
    }
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('Role DB read crash:', err.message);
    return [];
  }
}

async function upsertRoleDb(role, username) {
  if (!supabaseEnabled) return false;
  try {
    const { error } = await supabase
      .from('user_roles')
      .upsert(
        { username: normalizeUsername(username), role },
        { onConflict: 'username,role', ignoreDuplicates: false }
      );
    if (error) {
      console.error('Role DB upsert error:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Role DB upsert crash:', err.message);
    return false;
  }
}

async function removeRoleDb(role, username) {
  if (!supabaseEnabled) return false;
  try {
    const { error } = await supabase
      .from('user_roles')
      .delete()
      .eq('username', normalizeUsername(username))
      .eq('role', role);
    if (error) {
      console.error('Role DB delete error:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Role DB delete crash:', err.message);
    return false;
  }
}

async function listSellers() {
  const data = await readData();
  const local = Array.isArray(data.sellers) ? data.sellers : [];
  const map = new Map(local.map((item) => [normalizeUsername(item.username), item]));
  const dbRows = await getDbRoleRows('seller');
  for (const row of dbRows) {
    const username = normalizeUsername(row.username);
    if (!username) continue;
    if (!map.has(username)) {
      map.set(username, {
        username,
        displayName: username,
        createdAt: row.created_at || new Date().toISOString()
      });
    }
  }
  return Array.from(map.values());
}

async function listSupportAgents() {
  const data = await readData();
  const local = Array.isArray(data.supportAgents) ? data.supportAgents : [];
  const map = new Map(local.map((item) => [normalizeUsername(item.username), item]));
  const dbRows = await getDbRoleRows('support');
  for (const row of dbRows) {
    const username = normalizeUsername(row.username);
    if (!username) continue;
    if (!map.has(username)) {
      map.set(username, {
        username,
        displayName: username,
        createdAt: row.created_at || new Date().toISOString()
      });
    }
  }
  return Array.from(map.values());
}

async function isSeller(username) {
  const u = normalizeUsername(username);
  if (!u) return false;
  if (isAdmin(u)) return true;
  const sellers = await listSellers();
  return sellers.some((seller) => normalizeUsername(seller.username) === u);
}
async function isSupport(username) {
  const u = normalizeUsername(username);
  if (!u) return false;
  if (isAdmin(u)) return true;
  const agents = await listSupportAgents();
  return agents.some((agent) => normalizeUsername(agent.username) === u);
}
function supportMessageSummary(ticket) {
  return [
    `🆘 Новый запрос #${ticket.id}`,
    `Ник: ${ticket.nick}`,
    `Раздел: ${ticket.section}`,
    `Дата: ${ticket.date}`,
    `Проблема: ${ticket.problem}`
  ].join('\n');
}
function buildSupportTicketUrl(ticketId = '', username = '', dashboard = false) {
  const params = new URLSearchParams({ support: '1' });
  if (ticketId) params.set('ticket', String(ticketId));
  if (username) params.set('support_user', normalizeUsername(username));
  if (dashboard) params.set('support_dashboard', '1');
  return `${BASE_URL}/?${params.toString()}`;
}

const upload = multer({
  storage: supabaseEnabled ? multer.memoryStorage() : multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomUUID().slice(0, 8)}${path.extname(file.originalname || '') || '.jpg'}`)
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: 8 }
});

async function uploadSingleToSupabase(file) {
  const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
  const objectPath = `products/${Date.now()}-${crypto.randomUUID().slice(0, 8)}${ext}`;
  const input = file.buffer || await fsp.readFile(file.path);
  const { error } = await supabase.storage.from(SUPABASE_BUCKET).upload(objectPath, input, {
    contentType: file.mimetype || 'image/jpeg',
    upsert: false,
    cacheControl: '3600'
  });
  if (error) throw error;
  const { data } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(objectPath);
  return data.publicUrl || '';
}
async function persistUploadedImages(files = []) {
  if (!files.length) return [];
  try {
    if (supabaseEnabled) {
      const urls = await Promise.all(files.map((file) => uploadSingleToSupabase(file)));
      return urls.filter(Boolean);
    }
    return files.map((file) => `/uploads/${file.filename}`);
  } finally {
    await Promise.all(files.map(async (file) => {
      if (file.path) {
        try { await fsp.unlink(file.path); } catch (_err) {}
      }
    }));
  }
}

let supportBotInstance = null;
let mainBotInstance = null;
async function notifySupportAgents(ticket) {
  if (!supportBotInstance) return;
  const agents = (await listSupportAgents()).filter((agent) => agent.chatId);
  for (const agent of agents) {
    try {
      await supportBotInstance.telegram.sendMessage(agent.chatId, supportMessageSummary(ticket), Markup.inlineKeyboard([
        [Markup.button.callback('✅ Принять', `accept_ticket:${ticket.id}`), Markup.button.callback('⏭ Игнорировать', `ignore_ticket:${ticket.id}`)]
      ]));
    } catch (err) {
      console.error('Support notify error', err.message);
    }
  }
}

function storeChannelId(storeKey) {
  return String(STORE_CHANNELS[storeKey] || '').trim();
}
function productPostCaption(product) {
  const lines = [
    `${storeMeta[product.store]?.icon || '🛍'} ${product.title}`,
    '',
    product.shortDescription || '',
    `Цена: ${new Intl.NumberFormat('ru-RU').format(Number(product.price || 0))} ₽`,
    `Продавец: ${product.sellerLabel || '@' + product.sellerUsername}`,
    '',
    `Открыть в магазине: ${BASE_URL}/?store=${product.store}&product=${product.slug}`
  ];
  return lines.filter(Boolean).join('\n').slice(0, 1000);
}
async function postProductToTelegramChannel(product) {
  if (!mainBotInstance) return { ok: false, skipped: true, reason: 'main bot not ready' };
  const chatId = storeChannelId(product.store);
  if (!chatId) return { ok: false, skipped: true, reason: 'channel not configured' };
  const caption = productPostCaption(product);
  try {
    const image = product.mainImage || product.gallery?.[0] || '';
    const sellerUrl = normalizeSellerContact(product.sellerContact);
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.url('Открыть товар', `${BASE_URL}/?store=${product.store}&product=${product.slug}`)],
      ...(sellerUrl ? [[Markup.button.url('Написать продавцу', sellerUrl)]] : [])
    ]).reply_markup;
    if (image) {
      await mainBotInstance.telegram.sendPhoto(chatId, image, { caption, reply_markup: keyboard });
    } else {
      await mainBotInstance.telegram.sendMessage(chatId, caption, { reply_markup: keyboard });
    }
    return { ok: true };
  } catch (err) {
    console.error('Telegram channel post error', err.message);
    return { ok: false, error: err.message };
  }
}

app.get('/api/stores', async (_req, res) => {
  const data = await readData();
  const stores = Object.values(storeMeta).map((store) => ({
    ...store,
    categories: data.categories.filter((category) => category.store === store.key),
    productsCount: data.products.filter((product) => product.store === store.key).length
  }));
  res.json({ stores });
});
app.get('/api/store/:key', async (req, res) => {
  const store = storeMeta[req.params.key];
  if (!store) return res.status(404).json({ error: 'Магазин не найден' });
  const data = await readData();
  res.json({
    store,
    categories: data.categories.filter((c) => c.store === store.key),
    products: data.products.filter((p) => p.store === store.key).sort((a, b) => b.id - a.id)
  });
});
app.get('/api/store/:store/product/:slug', async (req, res) => {
  const data = await readData();
  const product = data.products.find((item) => item.store === req.params.store && item.slug === req.params.slug);
  if (!product) return res.status(404).json({ error: 'Товар не найден' });
  res.json(product);
});
app.get('/api/roles/:username', async (req, res) => {
  const username = normalizeUsername(req.params.username);
  res.json({
    isOwner: isOwner(username),
    isAdmin: isAdmin(username),
    isSeller: await isSeller(username),
    isSupport: await isSupport(username)
  });
});
app.get('/api/seller/:username', async (req, res) => {
  const username = normalizeUsername(req.params.username);
  const store = String(req.query.store || '').trim();
  const data = await readData();
  const products = data.products.filter((p) => normalizeUsername(p.sellerUsername) === username && (!store || p.store === store)).sort((a, b) => b.id - a.id);
  res.json({ seller: username, displayName: username, products });
});

app.get('/api/admin/roles', async (req, res) => {
  const by = normalizeUsername(req.query.by);
  if (!isAdmin(by)) return res.status(403).json({ error: 'Нет доступа' });
  const sellers = await listSellers();
  const support = await listSupportAgents();
  res.json({
    sellers: sellers.map((item) => ({ username: item.username, displayName: item.displayName || item.username, chatId: item.chatId || null })),
    support: support.map((item) => ({ username: item.username, displayName: item.displayName || item.username, chatId: item.chatId || null }))
  });
});
app.post('/api/admin/roles', async (req, res) => {
  const by = normalizeUsername(req.body.by);
  const target = normalizeUsername(req.body.target);
  const role = String(req.body.role || '').trim().toLowerCase();
  if (!isAdmin(by)) return res.status(403).json({ error: 'Нет доступа' });
  if (!target || !['seller', 'support'].includes(role)) return res.status(400).json({ error: 'Неверные данные' });

  await upsertRole(role, target);
  res.json({ ok: true });
});
app.delete('/api/admin/roles', async (req, res) => {
  const by = normalizeUsername(req.query.by);
  const target = normalizeUsername(req.query.target);
  const role = String(req.query.role || '').trim().toLowerCase();
  if (!isAdmin(by)) return res.status(403).json({ error: 'Нет доступа' });
  if (!target || !['seller', 'support'].includes(role)) return res.status(400).json({ error: 'Неверные данные' });

  await removeRole(role, target);
  res.json({ ok: true });
});
app.post('/api/categories', async (req, res) => {
  const { store, name, slug, by } = req.body || {};
  if (!storeMeta[store]) return res.status(400).json({ error: 'Неверный магазин' });
  if (!(await isSeller(by))) return res.status(403).json({ error: 'Нет прав продавца' });
  const data = await readData();
  const finalSlug = slugify(slug || name);
  if (data.categories.some((item) => item.store === store && item.slug === finalSlug)) return res.status(400).json({ error: 'Такая категория уже есть' });
  data.lastIds.category += 1;
  const category = { id: data.lastIds.category, store, name: String(name || '').trim(), slug: finalSlug, createdBy: normalizeUsername(by) };
  data.categories.push(category);
  await writeData(data);
  res.json({ ok: true, category });
});
app.post('/api/products', upload.array('images', 8), async (req, res) => {
  const body = req.body || {};
  const username = normalizeUsername(body.by);
  if (!(await isSeller(username))) return res.status(403).json({ error: 'Нет прав продавца' });
  const store = String(body.store || '').trim();
  const data = await readData();
  const categorySlug = String(body.category_slug || '').trim();
  if (!storeMeta[store] || !data.categories.some((c) => c.store === store && c.slug === categorySlug)) return res.status(400).json({ error: 'Категория не найдена' });
  const gallery = cleanImages([], await persistUploadedImages(req.files || []));
  const slug = slugify(body.slug || body.title);
  if (data.products.some((p) => p.store === store && p.slug === slug)) return res.status(400).json({ error: 'Такой slug уже занят' });
  data.lastIds.product += 1;
  const product = {
    id: data.lastIds.product,
    store,
    categorySlug,
    title: String(body.title || '').trim(),
    slug,
    shortDescription: String(body.short_description || '').trim(),
    fullDescription: String(body.full_description || '').trim(),
    price: Number(body.price || 0),
    sellerUsername: username,
    sellerContact: normalizeSellerContact(body.seller_contact),
    sellerLabel: String(body.seller_label || '').trim() || `@${username}`,
    mainImage: gallery[0] || '',
    gallery,
    badges: safeBadges(JSON.parse(body.badges || '[]')),
    type: String(body.type || 'physical').trim(),
    createdAt: new Date().toISOString()
  };
  data.products.push(product);
  if (!data.sellers.some((seller) => normalizeUsername(seller.username) === username)) data.sellers.push({ username, displayName: username, createdAt: new Date().toISOString() });
  await writeData(data);
  const channelPost = await postProductToTelegramChannel(product);
  res.json({ ok: true, product, channelPost });
});
app.put('/api/products/:id', upload.array('images', 8), async (req, res) => {
  const id = Number(req.params.id);
  const body = req.body || {};
  const username = normalizeUsername(body.by);
  const data = await readData();
  const product = data.products.find((item) => item.id === id);
  if (!product) return res.status(404).json({ error: 'Товар не найден' });
  if (!(isAdmin(username) || normalizeUsername(product.sellerUsername) === username)) return res.status(403).json({ error: 'Нет доступа' });
  const gallery = cleanImages(JSON.parse(body.existingGallery || JSON.stringify(product.gallery || [])), await persistUploadedImages(req.files || []));
  Object.assign(product, {
    title: String(body.title || product.title).trim(),
    shortDescription: String(body.short_description || product.shortDescription).trim(),
    fullDescription: String(body.full_description || product.fullDescription).trim(),
    price: Number(body.price ?? product.price),
    sellerContact: normalizeSellerContact(body.seller_contact || product.sellerContact),
    sellerLabel: String(body.seller_label || product.sellerLabel).trim(),
    categorySlug: String(body.category_slug || product.categorySlug).trim(),
    slug: slugify(body.slug || product.slug || product.title),
    badges: safeBadges(JSON.parse(body.badges || JSON.stringify(product.badges || []))),
    gallery,
    mainImage: gallery[0] || product.mainImage
  });
  await writeData(data);
  res.json({ ok: true, product });
});
app.delete('/api/products/:id', async (req, res) => {
  const id = Number(req.params.id);
  const username = normalizeUsername(req.query.by);
  const data = await readData();
  const product = data.products.find((item) => item.id === id);
  if (!product) return res.status(404).json({ error: 'Товар не найден' });
  if (!(isAdmin(username) || normalizeUsername(product.sellerUsername) === username)) return res.status(403).json({ error: 'Нет доступа' });
  data.products = data.products.filter((item) => item.id !== id);
  await writeData(data);
  res.json({ ok: true });
});

app.post('/api/products/:id/publish', async (req, res) => {
  const id = Number(req.params.id);
  const username = normalizeUsername(req.body.by);
  const data = await readData();
  const product = data.products.find((item) => item.id === id);
  if (!product) return res.status(404).json({ error: 'Товар не найден' });
  if (!(isAdmin(username) || normalizeUsername(product.sellerUsername) === username)) return res.status(403).json({ error: 'Нет доступа' });
  const result = await postProductToTelegramChannel(product);
  if (!result.ok) return res.status(400).json({ error: result.reason || result.error || 'Не удалось опубликовать товар' });
  res.json({ ok: true });
});

app.get('/api/support/tickets', async (req, res) => {
  const username = normalizeUsername(req.query.username);
  const mode = String(req.query.mode || 'my');
  const data = await readData();
  let tickets = [];
  if (mode === 'support') {
    if (!(await isSupport(username))) return res.status(403).json({ error: 'Нет прав техподдержки' });
    tickets = data.supportTickets;
  } else {
    tickets = data.supportTickets.filter((ticket) => normalizeUsername(ticket.userUsername) === username);
  }
  tickets = tickets.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
  res.json({ tickets });
});
app.get('/api/support/tickets/:id', async (req, res) => {
  const id = Number(req.params.id);
  const username = normalizeUsername(req.query.username);
  const data = await readData();
  const ticket = data.supportTickets.find((item) => item.id === id);
  if (!ticket) return res.status(404).json({ error: 'Запрос не найден' });
  if (!(await isSupport(username)) && normalizeUsername(ticket.userUsername) !== username) return res.status(403).json({ error: 'Нет доступа' });
  res.json({ ticket });
});
app.post('/api/support/tickets', async (req, res) => {
  const body = req.body || {};
  const username = normalizeUsername(body.by || body.nick);
  if (!username) return res.status(400).json({ error: 'Укажи Telegram username' });
  const data = await readData();
  data.lastIds.ticket += 1;
  data.lastIds.message += 1;
  const now = new Date().toISOString();
  const ticket = {
    id: data.lastIds.ticket,
    userUsername: username,
    nick: String(body.nick || `@${username}`).trim(),
    problem: String(body.problem || '').trim(),
    date: String(body.date || new Date().toLocaleString('ru-RU')).trim(),
    section: String(body.section || 'Общий').trim(),
    status: 'new',
    assignedSupport: '',
    createdAt: now,
    updatedAt: now,
    messages: [{ id: data.lastIds.message, authorType: 'user', authorUsername: username, text: String(body.problem || '').trim(), createdAt: now }]
  };
  data.supportTickets.push(ticket);
  await writeData(data);
  notifySupportAgents(ticket).catch(console.error);
  res.json({ ok: true, ticket });
});
app.post('/api/support/tickets/:id/messages', async (req, res) => {
  const id = Number(req.params.id);
  const username = normalizeUsername(req.body.username);
  const text = String(req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Пустое сообщение' });
  const data = await readData();
  const ticket = data.supportTickets.find((item) => item.id === id);
  if (!ticket) return res.status(404).json({ error: 'Запрос не найден' });
  const support = await isSupport(username);
  const owner = normalizeUsername(ticket.userUsername) === username;
  if (!support && !owner) return res.status(403).json({ error: 'Нет доступа' });
  data.lastIds.message += 1;
  ticket.messages.push({ id: data.lastIds.message, authorType: support ? 'support' : 'user', authorUsername: username, text, createdAt: new Date().toISOString() });
  if (support && !ticket.assignedSupport) ticket.assignedSupport = username;
  ticket.status = 'active';
  ticket.updatedAt = new Date().toISOString();
  await writeData(data);
  res.json({ ok: true, ticket });
});
app.post('/api/support/tickets/:id/assign', async (req, res) => {
  const id = Number(req.params.id);
  const username = normalizeUsername(req.body.username);
  if (!(await isSupport(username))) return res.status(403).json({ error: 'Нет прав техподдержки' });
  const data = await readData();
  const ticket = data.supportTickets.find((item) => item.id === id);
  if (!ticket) return res.status(404).json({ error: 'Запрос не найден' });
  ticket.assignedSupport = username;
  ticket.status = 'active';
  ticket.updatedAt = new Date().toISOString();
  await writeData(data);
  res.json({ ok: true, ticket });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => console.log(`SN Shop running on ${BASE_URL}`));

if (BOT_TOKEN) {
  const bot = new Telegraf(BOT_TOKEN);
  mainBotInstance = bot;
  const adminPending = new Map();
  async function upsertRole(listName, username) {
    const clean = normalizeUsername(username);
    if (!clean) return;
    await upsertRoleDb(listName, clean);

    const data = await readData();
    const list = listName === 'support' ? data.supportAgents : data.sellers;
    if (!list.some((item) => normalizeUsername(item.username) === clean)) {
      list.push({ username: clean, displayName: clean, createdAt: new Date().toISOString() });
      await writeData(data);
    }
  }
  async function removeRole(listName, username) {
    const clean = normalizeUsername(username);
    if (!clean) return;
    await removeRoleDb(listName, clean);

    const data = await readData();
    if (listName === 'support') data.supportAgents = data.supportAgents.filter((item) => normalizeUsername(item.username) !== clean);
    else data.sellers = data.sellers.filter((item) => normalizeUsername(item.username) !== clean);
    await writeData(data);
  }
  bot.start(async (ctx) => {
    const uname = normalizeUsername(ctx.from?.username);
    const seller = await isSeller(uname);
    const support = await isSupport(uname);
    const rows = [
      [Markup.button.webApp('👕 Магазин одежды · TripShop', `${BASE_URL}/?store=tripshop`)],
      [Markup.button.webApp('🧩 Магазин плагинов · LimbPL', `${BASE_URL}/?store=limbpl`)],
      [Markup.button.webApp('🧸 Магазин игрушек · TripToys', `${BASE_URL}/?store=triptoys`)],
      [Markup.button.webApp('📦 Заказы с Китая · TripChinaShop', `${BASE_URL}/?store=tripchinashop`)],
      [Markup.button.webApp('🆘 Техподдержка', `${BASE_URL}/?support=1`)]
    ];
    if (seller && uname) rows.push([Markup.button.webApp('🧑‍💼 Кабинет продавца', `${BASE_URL}/?seller=${uname}&dashboard=1`)]);
    if (support && uname) rows.push([Markup.button.webApp('🛠 Панель поддержки', buildSupportTicketUrl('', uname, true))]);
    if (isAdmin(uname)) rows.push([Markup.button.callback('⚙️ Роли и админка', 'admin_menu')]);
    await ctx.reply('Добро пожаловать в SN Shop. Выбери нужный раздел:', Markup.inlineKeyboard(rows));
  });
  bot.command('admin', async (ctx) => {
    if (!isAdmin(ctx.from?.username)) return ctx.reply('Нет доступа.');
    await ctx.reply('Админ-панель SN Shop', Markup.inlineKeyboard([
      [Markup.button.callback('➕ Выдать продавца', 'role_prompt:seller')],
      [Markup.button.callback('🛠 Выдать поддержку', 'role_prompt:support')],
      [Markup.button.callback('➖ Снять продавца', 'role_remove_prompt:seller')],
      [Markup.button.callback('🗑 Снять поддержку', 'role_remove_prompt:support')],
      [Markup.button.callback('📋 Показать роли', 'admin_roles')]
    ]));
  });
  bot.command('seller_add', async (ctx) => {
    if (!isAdmin(ctx.from?.username)) return ctx.reply('Нет доступа.');
    const arg = normalizeUsername(ctx.message.text.split(' ')[1]);
    if (!arg) return ctx.reply('Используй: /seller_add @username');
    await upsertRole('seller', arg);
    await ctx.reply(`Продавец @${arg} добавлен.`);
  });
  bot.command('support_add', async (ctx) => {
    if (!isAdmin(ctx.from?.username)) return ctx.reply('Нет доступа.');
    const arg = normalizeUsername(ctx.message.text.split(' ')[1]);
    if (!arg) return ctx.reply('Используй: /support_add @username');
    await upsertRole('support', arg);
    await ctx.reply(`Поддержка @${arg} добавлена. Пользователь должен нажать /start во втором support-боте.`);
  });
  bot.command('role', async (ctx) => {
    if (!isAdmin(ctx.from?.username)) return ctx.reply('Нет доступа.');
    const [, rawUser, rawRole] = ctx.message.text.split(/\s+/);
    const target = normalizeUsername(rawUser);
    const role = String(rawRole || '').trim().toLowerCase();
    if (!target || !['seller', 'support'].includes(role)) return ctx.reply('Используй: /role @username seller или /role @username support');
    await upsertRole(role, target);
    await ctx.reply(`Роль ${role} выдана @${target}.`);
  });
  bot.command('unrole', async (ctx) => {
    if (!isAdmin(ctx.from?.username)) return ctx.reply('Нет доступа.');
    const [, rawUser, rawRole] = ctx.message.text.split(/\s+/);
    const target = normalizeUsername(rawUser);
    const role = String(rawRole || '').trim().toLowerCase();
    if (!target || !['seller', 'support'].includes(role)) return ctx.reply('Используй: /unrole @username seller или /unrole @username support');
    await removeRole(role, target);
    await ctx.reply(`Роль ${role} снята с @${target}.`);
  });
  bot.command('roles', async (ctx) => {
    if (!isAdmin(ctx.from?.username)) return ctx.reply('Нет доступа.');
    const data = await readData();
    await ctx.reply(`Продавцы: ${data.sellers.map((v) => '@' + v.username).join(', ') || '—'}\nПоддержка: ${data.supportAgents.map((v) => '@' + v.username).join(', ') || '—'}`);
  });

  bot.action('admin_menu', async (ctx) => {
    if (!isAdmin(ctx.from?.username)) return ctx.answerCbQuery('Нет доступа', { show_alert: true });
    await ctx.answerCbQuery();
    return ctx.reply('Админ-панель SN Shop', Markup.inlineKeyboard([
      [Markup.button.callback('➕ Выдать продавца', 'role_prompt:seller')],
      [Markup.button.callback('🛠 Выдать поддержку', 'role_prompt:support')],
      [Markup.button.callback('➖ Снять продавца', 'role_remove_prompt:seller')],
      [Markup.button.callback('🗑 Снять поддержку', 'role_remove_prompt:support')],
      [Markup.button.callback('📋 Показать роли', 'admin_roles')]
    ]));
  });
  bot.action(/role_prompt:(seller|support)/, async (ctx) => {
    if (!isAdmin(ctx.from?.username)) return ctx.answerCbQuery('Нет доступа', { show_alert: true });
    const role = ctx.match[1];
    adminPending.set(ctx.from.id, { action: 'add', role });
    await ctx.answerCbQuery();
    return ctx.reply(`Отправь username для роли ${role}. Пример: @n0xlie`);
  });
  bot.action(/role_remove_prompt:(seller|support)/, async (ctx) => {
    if (!isAdmin(ctx.from?.username)) return ctx.answerCbQuery('Нет доступа', { show_alert: true });
    const role = ctx.match[1];
    adminPending.set(ctx.from.id, { action: 'remove', role });
    await ctx.answerCbQuery();
    return ctx.reply(`Отправь username, у которого нужно снять роль ${role}. Пример: @n0xlie`);
  });
  bot.action('admin_roles', async (ctx) => {
    if (!isAdmin(ctx.from?.username)) return ctx.answerCbQuery('Нет доступа', { show_alert: true });
    await ctx.answerCbQuery();
    const data = await readData();
    return ctx.reply(`Продавцы: ${data.sellers.map((v) => '@' + v.username).join(', ') || '—'}\nПоддержка: ${data.supportAgents.map((v) => '@' + v.username).join(', ') || '—'}`);
  });
  bot.on('text', async (ctx, next) => {
    const pending = adminPending.get(ctx.from.id);
    if (!pending || !isAdmin(ctx.from?.username)) return next();
    const target = normalizeUsername(ctx.message.text);
    if (!target || target.includes(' ')) return ctx.reply('Отправь только username, например: @n0xlie');
    if (pending.action === 'add') {
      await upsertRole(pending.role, target);
      adminPending.delete(ctx.from.id);
      return ctx.reply(`Готово. Роль ${pending.role} выдана @${target}.`);
    }
    if (pending.action === 'remove') {
      await removeRole(pending.role, target);
      adminPending.delete(ctx.from.id);
      return ctx.reply(`Готово. Роль ${pending.role} снята с @${target}.`);
    }
    return next();
  });
  bot.catch((err) => console.error('Main bot error', err));
  bot.launch().then(() => console.log('Main bot launched')).catch((err) => console.error('Main bot launch error', err));
}

if (SUPPORT_BOT_TOKEN) {
  const supportBot = new Telegraf(SUPPORT_BOT_TOKEN);
  supportBotInstance = supportBot;
  supportBot.start(async (ctx) => {
    const uname = normalizeUsername(ctx.from?.username);
    const supportAgents = await listSupportAgents();
    const hasSupportRole = supportAgents.some((item) => normalizeUsername(item.username) === uname);
    if (!hasSupportRole) return ctx.reply('У тебя нет роли техподдержки. Сначала выдай её через основной бот.');
    const data = await readData();
    let record = data.supportAgents.find((item) => normalizeUsername(item.username) === uname);
    if (!record) {
      record = { username: uname, displayName: uname, createdAt: new Date().toISOString() };
      data.supportAgents.push(record);
    }
    record.chatId = ctx.chat.id;
    await writeData(data);
    await ctx.reply('Support-бот подключён. Новые анкеты будут приходить сюда.', Markup.inlineKeyboard([
      [Markup.button.webApp('Открыть панель поддержки', buildSupportTicketUrl('', uname, true))]
    ]));
  });
  supportBot.action(/accept_ticket:(\d+)/, async (ctx) => {
    const uname = normalizeUsername(ctx.from?.username);
    if (!(await isSupport(uname))) return ctx.answerCbQuery('Нет доступа', { show_alert: true });
    const id = Number(ctx.match[1]);
    const data = await readData();
    const ticket = data.supportTickets.find((item) => item.id === id);
    if (!ticket) return ctx.answerCbQuery('Заявка не найдена', { show_alert: true });
    ticket.assignedSupport = uname;
    ticket.status = 'active';
    ticket.updatedAt = new Date().toISOString();
    await writeData(data);
    await ctx.editMessageText(`${supportMessageSummary(ticket)}\n\nПринял: @${uname}`, Markup.inlineKeyboard([
      [Markup.button.webApp('Открыть чат', buildSupportTicketUrl(ticket.id, uname, true))]
    ]));
    await ctx.answerCbQuery('Запрос принят');
  });
  supportBot.action(/ignore_ticket:(\d+)/, async (ctx) => {
    await ctx.answerCbQuery('Игнорировано');
    try { await ctx.editMessageReplyMarkup(Markup.inlineKeyboard([[Markup.button.callback('Игнорировано', 'noop')]]).reply_markup); } catch {}
  });
  supportBot.action('noop', (ctx) => ctx.answerCbQuery());
  supportBot.catch((err) => console.error('Support bot error', err));
  supportBot.launch().then(() => console.log('Support bot launched')).catch((err) => console.error('Support bot launch error', err));
}
