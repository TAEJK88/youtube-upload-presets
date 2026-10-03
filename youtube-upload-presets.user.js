// ==UserScript==
// @name         YouTube Upload Presets
// @namespace    yt-upload-presets
// @version      4.3.2
// @description  อัปโหลดหลายคลิปพร้อมพรีเซ็ต/ตั้งเวลา + สแกนและตัดส่วนที่ติดลิขสิทธิ์ (รวม YT Studio Helper) ใน YouTube Studio
// @match        https://studio.youtube.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @grant        unsafeWindow
// @grant        GM_info
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/TAEJK88/youtube-upload-presets/main/youtube-upload-presets.user.js
// @downloadURL  https://raw.githubusercontent.com/TAEJK88/youtube-upload-presets/main/youtube-upload-presets.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ===== ตั้งค่าพื้นฐาน =====
  const PRODUCER = 'ThaiBeats'; // ใช้แทนตัวแปร {producer}

  // ตัวแปรที่ใช้ได้ใน title / description / tags:
  //   {name}     ชื่อไฟล์ที่ล้างแล้ว (ตัดนามสกุล, ตัด "140bpm", แปลง _ เป็นช่องว่าง)
  //   {filename} ชื่อไฟล์ดิบ (ไม่มีนามสกุล)
  //   {bpm}      ตัวเลข BPM จากชื่อไฟล์ เช่น "Midnight 140bpm.mp4" -> 140
  //   {n}        เลขลำดับ EP (นับต่อเองแยกตามพรีเซ็ต)
  //   {date} {year} {producer}
  // ตัวแปรจากไฟล์ .txt ชื่อเดียวกับคลิป (เช่น clip01.mp4 + clip01.txt):
  //   {txt}        เนื้อหาไฟล์ทั้งหมด (เช่น tracklist + timestamp)
  //   {track1}     เพลงแรกใน tracklist (ตัด timestamp ออก)
  //   {trackcount} จำนวนเพลง
  //   {artists}    รายชื่อศิลปินคั่นด้วย , เช่น "SZA, Chris Brown, Nessy J., BLXD"
  //                เรียงตาม artistPriority ของพรีเซ็ตก่อน แล้วตามจำนวนเพลง จำนวนสูงสุดตาม artistMax
  //                ถ้าชื่อคลิปยาวเกิน 100 ตัวอักษร จะลดจำนวนศิลปินลงให้อัตโนมัติ
  //   ถ้าคำอธิบายไม่มี {txt} แต่คลิปมีไฟล์ .txt จะต่อท้ายคำอธิบายให้อัตโนมัติ
  // [[ ... ]] = ส่วนที่ไม่บังคับ ถ้าตัวแปรข้างในว่าง จะถูกตัดทิ้งทั้งก้อน
  const DEFAULT_PRESETS = [
    {
      id: 'trapsoul',
      label: '🌑 TrapSoul Mix',
      title: 'TrapSoul Mix[[ | {artists}]] - Dark & Smokey R&B Playlist {year}',
      description: [
        'TrapSoul Mix[[ | {artists}]] - Dark & Smokey R&B Playlist {year}',
        '',
        '[[Tracklist:\n{txt}]]',
        '',
        '#trapsoul #rnb #rnbplaylist #darkrnb',
      ].join('\n'),
      tags: ['trapsoul', 'trapsoul mix', 'dark r&b', 'smokey r&b', 'r&b playlist', 'r&b playlist {year}', '{artists}'],
      visibility: 'PRIVATE',
      // ศิลปินในรายการนี้จะถูกเรียงขึ้นก่อน (เฉพาะคนที่มีอยู่ใน tracklist) ที่เหลือเรียงตามจำนวนเพลง
      artistPriority: ['SZA', 'Chris Brown', 'Summer Walker', 'Bryson Tiller', 'Brent Faiyaz', 'Kehlani', 'Ella Mai', 'Nessy J.', 'BLXD'],
      artistMax: 4,
    },
    {
      id: 'playlist',
      label: '🎧 Playlist + Tracklist',
      title: '{artists} | R&B Playlist[[ ({trackcount} Songs)]]',
      description: '🎧 {artists}\n\nTracklist:\n{txt}\n\n#rnb #playlist #rnbplaylist',
      tags: ['rnb', 'r&b playlist', 'rnb playlist', '{artists}'],
      visibility: 'PRIVATE',
    },
    {
      id: 'typebeat',
      label: '🔥 Type Beat (FREE)',
      title: '[FREE] Thai Type Beat - "{name}"[[ | {bpm} BPM]]',
      description: [
        '[FREE] Thai Type Beat - "{name}"',
        '[[BPM: {bpm}]]',
        'Prod. by {producer}',
        '',
        '💰 ซื้อบีท / Lease: (ใส่ลิงก์)',
        '📩 ติดต่องาน: (ใส่อีเมล)',
        '',
        '⚠️ ใช้ฟรีแบบไม่แสวงหากำไร ต้องให้เครดิต (prod. {producer})',
        '',
        '#typebeat #thaibeat #freebeat',
      ].join('\n'),
      tags: ['type beat', 'thai type beat', 'free beat', 'thai beat', 'instrumental', '{name}', '{producer}'],
      visibility: 'PRIVATE',
    },
    {
      id: 'lofi',
      label: '🌙 Lofi Chill',
      title: '{name} 🌙 Thai Lofi Chill Beat สำหรับอ่านหนังสือ / ทำงาน',
      description: '{name} — บีทชิล ๆ สำหรับอ่านหนังสือ ทำงาน หรือพักผ่อน ☕\n\nProd. by {producer}\n\n#lofi #chillbeats #thailofi',
      tags: ['lofi', 'thai lofi', 'chill beat', 'study music', 'เพลงอ่านหนังสือ', '{producer}'],
      visibility: 'PRIVATE',
    },
    {
      id: 'shorts',
      label: '📱 Shorts',
      title: '{name} 🔥 #shorts #thaibeat',
      description: '{name}[[ | {bpm} BPM]]\nProd. by {producer}\n\n#shorts #beat #producer',
      tags: ['shorts', 'beat', 'producer', 'thai beat'],
      visibility: 'PRIVATE',
    },
    {
      id: 'instrumental',
      label: '🎹 Instrumental',
      title: '{name} - Instrumental (Prod. {producer})',
      description: '{name} (Instrumental)\nProd. by {producer}\n© {year} {producer}',
      tags: ['instrumental', 'beat', '{name}', '{producer}'],
      visibility: 'PRIVATE',
    },
    {
      id: 'series',
      label: '📺 ทำบีทสด EP',
      title: 'ทำบีทสด EP.{n} - {name}[[ ({bpm} BPM)]]',
      description: 'ทำบีทสด EP.{n} — {name}\nอัปโหลดเมื่อ {date}\n\nProd. by {producer}',
      tags: ['ทำบีท', 'beat making', 'cook up', 'producer', '{producer}'],
      visibility: 'PRIVATE',
    },
  ];

  const VIS = { PRIVATE: '🔒 ส่วนตัว', UNLISTED: '🔗 ไม่เป็นสาธารณะ', PUBLIC: '🌐 สาธารณะ' };
  const VARS = ['name', 'bpm', 'n', 'date', 'year', 'filename', 'producer', 'txt', 'track1', 'trackcount', 'artists'];
  const VIDEO_EXT = /\.(mp4|mov|mkv|avi|webm|m4v|wmv|flv|3gp|mpe?g)$/i;
  const TXT_EXT = /\.txt$/i;
  const IMG_EXT = /\.(jpe?g|png|gif|bmp|webp)$/i;
  const THUMB_MAX = 2 * 1024 * 1024; // YouTube รับภาพปกไม่เกิน 2MB
  const DESC_MAX = 5000;
  let injectingFile = false; // ระหว่างที่สคริปต์ส่งไฟล์ให้ Studio เอง
  const SCHEDULE_MIN_LEAD = 15 * 60 * 1000; // YouTube ต้องตั้งเวลาล่วงหน้าอย่างน้อยประมาณ 15 นาที
  const TITLE_MAX = 100;

  // ===== storage =====
  const load = (k, d) => {
    const v = GM_getValue(k);
    return v === undefined ? d : v;
  };
  const save = (k, v) => GM_setValue(k, v);

  let presets = load('presets', DEFAULT_PRESETS);
  // ผู้ใช้เวอร์ชันเก่า: เพิ่มพรีเซ็ต Playlist ให้ครั้งเดียว
  if (!load('addedPlaylist', false)) {
    if (!presets.some((p) => p.id === 'playlist')) presets = [DEFAULT_PRESETS[1], ...presets];
    save('presets', presets);
    save('addedPlaylist', true);
  }
  let activeId = load('activeId', presets[0].id);
  // คลิปที่ไม่มี .txt จะได้ชื่อ "TrapSoul Mix | - ..." -> ครอบ {artists} ด้วย [[ ]] ให้พรีเซ็ตเดิม
  for (const p of presets) {
    if (p.id !== 'trapsoul') continue;
    if (p.title === 'TrapSoul Mix | {artists} - Dark & Smokey R&B Playlist {year}') p.title = 'TrapSoul Mix[[ | {artists}]] - Dark & Smokey R&B Playlist {year}';
    if (typeof p.description === 'string') {
      p.description = p.description
        .replace('TrapSoul Mix | {artists} - Dark & Smokey R&B Playlist {year}', 'TrapSoul Mix[[ | {artists}]] - Dark & Smokey R&B Playlist {year}')
        .replace('Tracklist:\n{txt}', '[[Tracklist:\n{txt}]]')
        .replace('[[[[Tracklist:', '[[Tracklist:').replace('{txt}]]]]', '{txt}]]');
    }
  }
  if (!load('addedTrapsoul', false)) {
    if (!presets.some((p) => p.id === 'trapsoul')) presets = [DEFAULT_PRESETS[0], ...presets];
    activeId = 'trapsoul';
    save('presets', presets);
    save('activeId', activeId);
    save('addedTrapsoul', true);
  }
  let counters = load('counters', {});
  const settings = Object.assign(
    {
      autoApply: load('autoApply', true), // อัปโหลดเองทีละไฟล์ -> เติมข้อมูลให้
      autoNext: load('autoNext', false), // กด Next ไปหน้า Visibility ให้
      autoSave: true, // โหมดคิว: กด Save ให้เลย
      thumb: true, // โหมดคิว: อัปภาพปกจากไฟล์ภาพชื่อเดียวกับคลิป
      thumbWaitMin: 120, // รอวิดีโออัปเสร็จเพื่อใส่ภาพปกได้นานสุดกี่นาที
      intercept: true, // ดักการเลือกหลายไฟล์ในหน้าต่างของ Studio มาเข้าคิว
      delay: 3, // วินาทีที่พักระหว่างไฟล์
      pace: 'slow', // จังหวะการทำงาน: normal (x1) | slow (x1.6) | slower (x2.5) — ยืดเวลาพัก/เวลารอทุกขั้น สำหรับเน็ตหรือเครื่องที่โหลดช้า
      year: '', // ปีที่ใช้ใน {year} เว้นว่าง = ปีปัจจุบัน
      confirmStart: true, // ถามยืนยันชื่อช่องก่อนเริ่มคิว
      category: 'Music', // หมวดหมู่ (ข้อความตามที่ Studio แสดง) เว้นว่าง = ไม่ตั้ง
      alteredContent: 'skip', // เนื้อหาดัดแปลง/สังเคราะห์ (AI use): skip | no | yes
      paidPromotion: 'no', // การโปรโมตแบบชำระเงิน: skip | no | yes
      monetization: 'on', // ขั้น Monetisation: on | off | skip
      adSuitability: 'none', // ขั้น Ad suitability: none = ติ๊ก "None of the above" แล้ว Submit rating | skip = ทำเอง
      lockChannel: null, // { id, name } ช่องที่อนุญาตให้อัป (null = ไม่ล็อก)
      // ตั้งเวลาปล่อย: คลิปแรกปล่อยตอน start แล้วคลิปถัดไปห่างกันทีละ every (unit = 'hour' | 'day')
      schedule: { on: false, start: '', every: 1, unit: 'day' },
    },
    load('settings', {})
  );
  const saveSettings = () => save('settings', settings);

  const presetById = (id) => presets.find((p) => p.id === id) || presets[0];
  const active = () => presetById(activeId);

  // ===== template =====
  const pad = (x) => String(x).padStart(2, '0');

  // อ่าน tracklist: "01:03:05 Kehlani - Folded (Cover by BLXD)" -> ชื่อเพลง + ศิลปิน
  function parseTracks(txt, priority = []) {
    const tracks = String(txt || '')
      .split(/\r?\n/)
      .map((l) => l.replace(/^\s*(\d{1,2}:)?\d{1,2}:\d{2}\s*[-–|]?\s*/, '').replace(/^\d{1,3}\.\s*/, '').trim())
      .filter(Boolean);
    const count = new Map(); // key ตัวพิมพ์เล็ก -> { name, n, first }
    const add = (raw) => {
      for (const a of raw.split(/\s+(?:x|ft\.?|feat\.?|&|and)\s+|,\s*/i)) {
        const name = a.replace(/^(?:ft\.?|feat\.?)\s+/i, '').trim();
        if (!name) continue;
        const key = name.toLowerCase();
        const c = count.get(key) || { name, n: 0, first: count.size };
        c.n++;
        count.set(key, c);
      }
    };
    for (const t of tracks) {
      const [artistPart, ...rest] = t.split(/\s[-–]\s/);
      if (!rest.length) continue;
      add(artistPart);
      // ศิลปินรับเชิญในชื่อเพลง เช่น "Waiting On Me (ft. Brent Faiyaz)"
      const song = rest.join(' - ');
      const feat = song.match(/\((?:ft\.?|feat\.?)\s+([^)]+)\)/i) || song.match(/\s(?:ft\.?|feat\.?)\s*([^()]+)$/i);
      if (feat) add(feat[1]);
    }
    const prio = priority.map((p) => String(p).trim().toLowerCase()).filter(Boolean);
    const rank = (c) => {
      const i = prio.indexOf(c.name.toLowerCase());
      return i === -1 ? Infinity : i;
    };
    const artistList = [...count.values()]
      .sort((a, b) => rank(a) - rank(b) || b.n - a.n || a.first - b.first)
      .map((c) => c.name);
    return { track1: tracks[0] || '', trackcount: tracks.length ? String(tracks.length) : '', artistList };
  }

  // opt.preset = พรีเซ็ตที่ใช้ (อ่าน artistPriority / artistMax), opt.artists = ชื่อศิลปินที่พิมพ์เองในการ์ด
  function buildVars(rawName, n, txt = '', opt = {}) {
    const base = String(rawName || '').replace(VIDEO_EXT, '').trim();
    const bpm = (base.match(/(\d{2,3})\s*bpm/i) || [])[1] || '';
    const name = base
      .replace(/(\d{2,3})\s*bpm/gi, '')
      .replace(/_+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/^[\s\-–|,.]+|[\s\-–|,.]+$/g, '');
    const d = new Date();
    const p = opt.preset || {};
    const { artistList, ...tr } = parseTracks(txt, p.artistPriority || []);
    const max = Math.max(1, Number(p.artistMax) || 4);
    const manual = (opt.artists || '').trim();
    const shown = manual ? [] : artistList.slice(0, max);
    return {
      name: name || base,
      filename: base,
      bpm,
      n: String(n),
      date: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`,
      year: String(settings.year || d.getFullYear()),
      producer: PRODUCER,
      txt: String(txt || '').replace(/\r\n/g, '\n').trim(),
      ...tr,
      artists: manual || shown.join(', '),
      _artists: shown, // ใช้ภายในสำหรับย่อชื่อคลิปที่ยาวเกิน
    };
  }

  function render(tpl, vars) {
    return String(tpl || '')
      .replace(/\[\[([\s\S]*?)\]\]/g, (_, inner) => {
        const keys = [...inner.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
        return keys.every((k) => vars[k]) ? inner : '';
      })
      .replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m))
      .replace(/\n{3,}/g, '\n\n');
  }

  // YouTube ไม่รับเครื่องหมาย < > ในชื่อและคำอธิบาย
  const clean = (s) => String(s).replace(/[<>]/g, '');
  const renderTitle = (tpl, vars) => clean(render(tpl, vars)).replace(/\s+/g, ' ').trim();
  // ชื่อคลิปยาวเกิน 100 ตัวอักษร -> ลดจำนวนศิลปินทีละคนจนพอดี
  function makeTitle(p, vars) {
    let t = renderTitle(p.title, vars);
    for (let k = vars._artists.length - 1; t.length > TITLE_MAX && k >= 1; k--) {
      t = renderTitle(p.title, { ...vars, artists: vars._artists.slice(0, k).join(', ') });
    }
    return t.slice(0, TITLE_MAX);
  }
  const renderTags = (p, vars) => [
    ...new Set(
      (p.tags || [])
        .flatMap((t) => render(t, vars).split(/,|\s+x\s+/i))
        .map((t) => clean(t).trim())
        .filter(Boolean)
    ),
  ];
  // ถ้าพรีเซ็ตไม่ได้ใส่ {txt} แต่คลิปมีไฟล์ .txt ให้ต่อท้ายคำอธิบาย
  function renderDesc(p, vars) {
    let d = render(p.description, vars).trim();
    if (vars.txt && !/\{txt\}/.test(p.description || '')) d = d ? `${d}\n\n${vars.txt}` : vars.txt;
    return clean(d).slice(0, DESC_MAX);
  }

  // ===== Studio DOM automation =====
  // จังหวะการทำงาน: คูณเวลาพักและเวลารอทั้งหมด (หน้า Studio โหลดช้า -> เลือก "ช้า" หรือ "ช้ามาก")
  const PACE = { normal: 1, slow: 1.6, slower: 2.5 };
  const pace = () => PACE[settings.pace] || 1;
  const T = (ms) => ms * pace();
  const sleep = (ms) => new Promise((r) => setTimeout(r, T(ms)));
  const isVisible = (el) => !!el && el.isConnected && el.getClientRects().length > 0;

  async function waitFor(fn, timeout = 10000, step = 200) {
    const t0 = Date.now();
    const limit = T(timeout);
    while (Date.now() - t0 < limit) {
      const v = fn();
      if (v) return v;
      await sleep(step);
    }
    return null;
  }

  const getDialog = () => document.querySelector('ytcp-uploads-dialog');
  const getTitleBox = (dlg) => dlg && dlg.querySelector('#title-textarea #textbox');
  const getDescBox = (dlg) => dlg && dlg.querySelector('#description-textarea #textbox');
  const detailsOpen = () => isVisible(getTitleBox(getDialog()));
  // หน้าต่างอัปโหลดยังเปิดอยู่ (ขั้นไหนก็ได้) — ใช้ตัดสินว่าผู้ใช้กด Save/ปิดหน้าต่างแล้วหรือยัง
  const uploadDialogOpen = () => {
    const d = getDialog()?.querySelector('tp-yt-paper-dialog');
    return isVisible(d) && !isVisible(getDialog()?.querySelector('ytcp-uploads-file-picker #select-files-button'));
  };
  const findTagsInput = (dlg) =>
    dlg.querySelector(
      '#tags-container input#text-input, ytcp-form-input-container#tags-container input, input[aria-label*="tag" i], input[aria-label*="แท็ก"]'
    );

  // พิมพ์ลงช่อง contenteditable ผ่าน execCommand เพื่อให้ Studio รับรู้การเปลี่ยนแปลง
  function setEditable(el, text) {
    el.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
    text.split('\n').forEach((line, i) => {
      if (i) document.execCommand('insertLineBreak', false, null);
      if (line) document.execCommand('insertText', false, line);
    });
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.blur();
  }

  async function setTags(dlg, tags) {
    if (!tags.length) return true;
    let input = findTagsInput(dlg);
    if (!isVisible(input)) {
      const more = dlg.querySelector('#toggle-button'); // ปุ่ม "แสดงเพิ่มเติม"
      if (more) more.click();
      input = await waitFor(() => {
        const i = findTagsInput(dlg);
        return isVisible(i) && i;
      }, 4000);
    }
    if (!input) return false;
    input.focus();
    document.execCommand('insertText', false, tags.join(',') + ',');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(200);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
    input.blur();
    return true;
  }

  async function fillDetails({ title, description, tags }) {
    const dlg = getDialog();
    setEditable(getTitleBox(dlg), title);
    const descBox = getDescBox(dlg);
    if (descBox && description) setEditable(descBox, description);
    const notKids = dlg.querySelector('tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]');
    if (notKids) notKids.click();
    const tagsOk = await setTags(dlg, tags); // เปิด "แสดงเพิ่มเติม" ให้ด้วย
    if (settings.alteredContent !== 'skip') {
      const yes = settings.alteredContent === 'yes';
      const name = yes ? 'VIDEO_HAS_ALTERED_CONTENT_YES' : 'VIDEO_HAS_ALTERED_CONTENT_NO';
      // ส่วน "AI use" : ปุ่มตัวเลือก Yes / No ใต้หัวข้อนั้น
      const aiRadio = () => {
        const byName = dlg.querySelector(`tp-yt-paper-radio-button[name="${name}"]`);
        if (isVisible(byName)) return byName;
        const head = leafByText(dlg, /^(ai use|การใช้ ai|altered content)$/i);
        let p = head;
        for (let i = 0; p && i < 6; i++, p = p.parentElement) {
          const r = [...p.querySelectorAll('tp-yt-paper-radio-button, [role="radio"]')].find((x) => isVisible(x) && (yes ? /^(yes|ใช่)$/i : /^(no|ไม่|ไม่ใช่)$/i).test((x.textContent || '').trim()));
          if (r) return r;
        }
        return null;
      };
      const r = await waitFor(aiRadio, 3000);
      if (r && r.getAttribute('aria-checked') !== 'true') r.click();
    }
    if (settings.paidPromotion !== 'skip') {
      const r = radioByText(settings.paidPromotion === 'yes'
        ? /^yes, my video includes paid promotion|^ใช่ วิดีโอของฉันมีการโปรโมตแบบชำระเงิน/i
        : /^no, my video doesn.t include paid promotion|^ไม่ วิดีโอของฉันไม่มีการโปรโมตแบบชำระเงิน/i);
      if (r && r.getAttribute('aria-checked') !== 'true') r.click();
    }
    if (settings.category) await setCategory(dlg, settings.category);
    return tagsOk;
  }

  // เลือกหมวดหมู่ (เทียบข้อความตามที่ Studio แสดง เช่น "Music" หรือ "เพลง")
  async function setCategory(dlg, text) {
    const trig = dlg.querySelector('#category ytcp-dropdown-trigger, #category-container ytcp-dropdown-trigger');
    if (!trig || trig.textContent.includes(text)) return;
    trig.click();
    const item = await waitFor(() =>
      [...document.querySelectorAll('tp-yt-paper-listbox tp-yt-paper-item')].find((i) => isVisible(i) && i.textContent.trim() === text), 3000);
    if (item) item.click();
    else document.body.click();
  }

  // อัปภาพปก (ช่องนี้จะมีเฉพาะช่องที่ยืนยันตัวตนด้วยเบอร์โทรแล้ว) คืนค่าข้อความผิดพลาด หรือ '' ถ้าสำเร็จ
  // หา element จากข้อความ (เทียบทั้งข้อความ) ภายใน root
  const leafByText = (rootEl, re) =>
    [...rootEl.querySelectorAll('*')].find((e) => e.childElementCount === 0 && isVisible(e) && re.test((e.textContent || '').trim()));
  const clickableOf = (el) => el && (el.closest('button, [role="button"], ytcp-button, tp-yt-paper-button, ytcp-thumbnail-uploader, ytcp-thumbnails-compact-editor-uploader') || el);

  // อัปภาพปก (Studio ต.ค. 2026: ส่วน "Thumbnail" มีกล่อง "Upload file" / "Select from video" / "A/B Testing")
  // วิธีที่ 1: ใส่ภาพลงช่องเลือกไฟล์ที่ไม่ใช่ช่องวิดีโอ  วิธีที่ 2: จำลองการลากภาพมาวางบนกล่อง "Upload file"
  // ถือว่าสำเร็จเมื่อมีภาพใหม่ (blob:/data:) ขึ้นในหน้าต่าง คืนค่าข้อความผิดพลาด หรือ '' ถ้าสำเร็จ
  const THUMB_AREA = 'ytcp-thumbnails-compact-editor-uploader, ytcp-thumbnail-uploader, ytcp-video-custom-still-editor, #still-picker, ytcp-thumbnails-compact-editor, [id*="thumbnail" i]';
  const RE_UPLOAD_FILE = /^(upload file|upload thumbnail|อัปโหลดไฟล์|อัปโหลดภาพขนาดย่อ)$/i;
  async function setThumbnail(file, wait = 6000) {
    if (file.size > THUMB_MAX) return `ภาพปกใหญ่เกิน 2MB (${(file.size / 1048576).toFixed(1)} MB)`;
    if (!/\.(jpe?g|png|gif|bmp)$/i.test(file.name)) return 'ชนิดไฟล์ไม่รองรับ ใช้ JPG / PNG / GIF / BMP';
    const dlg = getDialog();
    if (!dlg) return 'ไม่พบหน้าต่างอัปโหลด';
    const uploadBox = () => clickableOf(leafByText(dlg, RE_UPLOAD_FILE));
    const area = () => [...dlg.querySelectorAll(THUMB_AREA)].find(shown) || null;
    await waitFor(() => uploadBox() || area(), 6000);
    const blobs = () => [...dlg.querySelectorAll('img')].filter((i) => /^(blob|data):/.test(i.src)).map((i) => i.src);
    const before = new Set(blobs());
    const changed = () => blobs().some((x) => !before.has(x));
    const makeDT = () => {
      const dt = new DataTransfer();
      dt.items.add(file);
      return dt;
    };
    const dropOn = async (el) => {
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      const base = { bubbles: true, cancelable: true, composed: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
      for (const type of ['dragenter', 'dragover', 'drop']) {
        el.dispatchEvent(new DragEvent(type, Object.assign({ dataTransfer: makeDT() }, base)));
        await sleep(150);
      }
    };

    injectingFile = true;
    try {
      const inputs = [...dlg.querySelectorAll('input[type=file]')].filter((i) => i.name !== 'Filedata' && !i.closest('ytcp-uploads-file-picker'));
      for (const input of inputs) {
        input.files = makeDT().files;
        input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        if (await waitFor(changed, wait)) return '';
      }
      const targets = [uploadBox(), area()].filter(Boolean);
      for (const el of [...new Set(targets)]) {
        await dropOn(el);
        if (await waitFor(changed, wait)) return '';
      }
      if (!targets.length && !inputs.length) return 'ไม่พบส่วน Thumbnail / ปุ่ม "Upload file" ในหน้ากรอกรายละเอียด';
      const err = [...dlg.querySelectorAll('*')].find((e) => e.childElementCount === 0 && isVisible(e) &&
        /(thumbnail|image|ภาพ).*(error|fail|large|ใหญ่|ไม่)/i.test(e.textContent || ''));
      return err ? `Studio แจ้ง: ${err.textContent.trim().slice(0, 120)}` :
        `Studio ยังไม่รับภาพปก (ช่องเลือกไฟล์ ${inputs.length} · ปุ่ม Upload file ${uploadBox() ? 'เจอ' : 'ไม่เจอ'})`;
    } finally {
      injectingFile = false;
    }
  }

  // ----- ขั้นใหม่ระหว่าง Details กับ Visibility -----
  const radioByText = (re) => [...(getDialog()?.querySelectorAll('tp-yt-paper-radio-button, [role="radio"]') || [])]
    .find((r) => isVisible(r) && re.test((r.textContent || '').trim()));
  const buttonByText = (rootEl, re) => [...rootEl.querySelectorAll('button, ytcp-button, tp-yt-paper-button')]
    .find((b) => isVisible(b) && re.test((b.textContent || '').trim()) && !b.hasAttribute('disabled') && b.getAttribute('aria-disabled') !== 'true');

  // Monetisation: ช่อง "Select" (ytcp-video-monetization) → กดปุ่มไอคอนเพื่อเปิดป๊อปอัป
  // ป๊อปอัปอยู่นอกหน้าต่างอัปโหลด: ytcp-video-monetization-edit-dialog > #radio-on / #radio-off > #save-button ("Done")
  // คืนค่า true เมื่อตั้งค่าแล้ว (หรือไม่ต้องทำ), false เมื่อยังทำไม่เสร็จ
  async function handleMonetisation() {
    if (settings.monetization === 'skip') return true;
    const box = getDialog()?.querySelector('ytcp-video-monetization');
    if (!shown(box)) return true; // ไม่ได้อยู่ที่ขั้นนี้ (element นี้อาจไม่มีกล่องของตัวเอง จึงเช็กจากลูกด้วย)
    const want = settings.monetization === 'off' ? 'off' : 'on';
    const current = (box.innerText || '').trim().toLowerCase();
    if (current === want || current === (want === 'on' ? 'เปิด' : 'ปิด')) return true;
    const popup = () => {
      const d = document.querySelector('ytcp-video-monetization-edit-dialog');
      return d && isVisible(d.querySelector(`#radio-${want}`)) ? d : null;
    };
    if (!popup()) {
      const trigger = box.querySelector('ytcp-icon-button, [role="button"], button') || box;
      (trigger.querySelector('button') || trigger).click();
    }
    const pop = await waitFor(popup, 4000);
    if (!pop) return false;
    const radio = pop.querySelector(`#radio-${want}`);
    if (radio.getAttribute('aria-checked') !== 'true') radio.click();
    const save = await waitFor(() => {
      const b2 = pop.querySelector('#save-button button') || pop.querySelector('#save-button');
      return b2 && !b2.disabled && b2.getAttribute('aria-disabled') !== 'true' ? b2 : null;
    }, 3000);
    if (save) save.click();
    await waitFor(() => !popup(), 4000);
    await sleep(500);
    return (box.innerText || '').trim().toLowerCase() === want;
  }

  // Ad suitability: ติ๊ก [role=checkbox][aria-label="None of the above"] → กด #submit-questionnaire-button ("Submit rating")
  // ส่งแล้วแบบสอบถามจะถูกล็อก ("questionnaire is locked")
  async function handleAdSuitability() {
    if (settings.adSuitability !== 'none') return true;
    const dlg = getDialog();
    // แก้บัค: querySelector แบบหลายตัวเลือกคืนตัวนอก (ytcp-uploads-content-ratings) ซึ่งไม่มีกล่องของตัวเอง
    // isVisible จึงเป็น false -> สคริปต์คิดว่าไม่ได้อยู่ขั้นนี้แล้วกด Next ข้ามไปโดยไม่ได้ Submit rating
    const q = dlg?.querySelector('ytpp-self-certification-questionnaire') || dlg?.querySelector('ytcp-uploads-content-ratings');
    const onStep = shown(q) || /ad suitability|ความเหมาะสมกับโฆษณา/i.test([...(dlg?.querySelectorAll('h1') || [])].filter(isVisible).map((e) => e.textContent).join(' '));
    if (!q || !onStep) return true; // ไม่ได้อยู่ที่ขั้นนี้
    // แก้บัค: แผงด้านขวามีประโยค "Once you've submitted your rating, you won't be able to change…" อยู่ตลอด
    // ห้ามใช้คำว่า "submitted your rating" ตัดสิน — ใช้ข้อความล็อกจริง "questionnaire is locked since you have submitted your rating"
    const isLocked = () => /questionnaire is locked|is locked since|ถูกล็อก/i.test(q.innerText || '');
    if (isLocked()) return true; // ส่งไปแล้ว
    const box = q.querySelector('[role="checkbox"][aria-label="None of the above"], [role="checkbox"][aria-label*="ไม่มี"]') ||
      [...q.querySelectorAll('[role="checkbox"]')].find((c) => /none of the above|ไม่มีข้อใด/i.test(c.getAttribute('aria-label') || ''));
    if (!box) return false;
    if (box.getAttribute('aria-checked') !== 'true') box.click();
    const submit = await waitFor(() => {
      const b2 = dlg.querySelector('#submit-questionnaire-button button') || dlg.querySelector('#submit-questionnaire-button');
      return b2 && isVisible(b2) && !b2.disabled && b2.getAttribute('aria-disabled') !== 'true' ? b2 : null;
    }, 4000);
    if (!submit) return false;
    submit.click();
    await sleep(800);
    // บางครั้ง Studio ถามยืนยันอีกชั้นในหน้าต่างแยก
    const pop = [...document.querySelectorAll('tp-yt-paper-dialog, ytcp-dialog, [role="dialog"]')]
      .find((d) => isVisible(d) && !d.closest('ytcp-uploads-dialog') && /rating|suitab|คะแนน|ความเหมาะสม/i.test(d.innerText || ''));
    const ok = pop && buttonByText(pop, /^(submit|submit rating|confirm|ส่ง|ยืนยัน)$/i);
    if (ok) ok.click();
    return !!(await waitFor(isLocked, 10000));
  }

  // กด Next ไปจนถึงหน้า Visibility แล้วเลือกค่า (vis = null คือไปถึงหน้านั้นแต่ไม่เลือก)
  async function goToVisibility(vis) {
    const radio = () => {
      const r = getDialog()?.querySelector(`tp-yt-paper-radio-button[name="${vis || 'PRIVATE'}"]`);
      return isVisible(r) && r;
    };
    // ปุ่ม Next กดได้ตลอดแม้ยังไม่ตอบ จึงต้องรอให้ขั้นใหม่โหลดเสร็จ (1.5 วิ) แล้วทำขั้นนั้นให้ครบก่อนค่อยกด Next
    const stepName = () => [...(getDialog()?.querySelectorAll('h1') || [])].filter(isVisible).map((e) => e.textContent.trim()).join('/');
    const t0 = Date.now();
    let step = '';
    let stepAt = Date.now();
    while (!radio() && Date.now() - t0 < T(120000)) {
      const name = stepName();
      if (name !== step) { step = name; stepAt = Date.now(); }
      if (Date.now() - stepAt < T(1500)) { await sleep(300); continue; }
      const ok = (await handleMonetisation()) && (await handleAdSuitability());
      if (!ok) {
        if (Date.now() - stepAt > T(25000)) throw new Error(`ทำขั้น "${step}" ไม่สำเร็จ — ทำขั้นนี้เองในหน้าต่าง แล้วกดลองใหม่`);
        await sleep(1000);
        continue;
      }
      const next = getDialog()?.querySelector('#next-button');
      const nb = next && (next.querySelector('button') || next);
      if (isVisible(next) && !next.hasAttribute('disabled') && nb.getAttribute('aria-disabled') !== 'true' && !nb.disabled) nb.click();
      else if (Date.now() - stepAt > T(25000)) break;
      await sleep(1200);
    }
    const r = radio();
    if (r && vis) r.click();
    return !!r;
  }

  // ----- ตั้งเวลาปล่อย -----
  const studioLang = () => document.documentElement.lang || navigator.language || 'en';

  // พิมพ์ค่าลงช่อง input ของ Studio แล้วกด Enter ให้ระบบรับค่า
  async function typeInto(input, text) {
    input.focus();
    input.select?.();
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(150);
    for (const type of ['keydown', 'keyup']) {
      input.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
    }
    await sleep(500);
  }

  // จัดรูปแบบวันที่ให้ตรงกับที่ช่องวันที่ของ Studio แสดงอยู่ (ดูจากค่าเดิม เช่น "Oct 2, 2026" หรือ "2 ต.ค. 2569")
  function formatStudioDate(date, sample) {
    const year = Number(((sample || '').match(/\d{4}/) || [])[0]);
    const buddhist = year > 2400;
    const lang = studioLang();
    const out = new Intl.DateTimeFormat(`${lang}-u-ca-gregory`, { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
    // ปีให้ตรงกับระบบที่ Studio ใช้ (พ.ศ. / ค.ศ.)
    return out.replace(/\d{4}/, String(date.getFullYear() + (buddhist ? 543 : 0)));
  }
  const formatStudioTime = (date) =>
    new Intl.DateTimeFormat(`${studioLang()}-u-ca-gregory`, { hour: 'numeric', minute: '2-digit' }).format(date);

  // ตั้งเวลาปล่อยในหน้า Visibility คืนค่าข้อความผิดพลาด หรือ '' ถ้าสำเร็จ
  async function setSchedule(date) {
    const dlg = getDialog();
    const expand = await waitFor(() => {
      const e = dlg.querySelector('#second-container-expand-button, ytcp-visibility-scheduler #schedule-radio-button, #schedule-radio-button');
      return isVisible(e) && e;
    }, 6000);
    if (!expand) return 'ไม่พบส่วน "กำหนดเวลา" ในหน้าการเปิดเผย';
    expand.click();

    const trigger = await waitFor(() => {
      const t = dlg.querySelector('#datepicker-trigger');
      return isVisible(t) && t;
    }, 5000);
    if (!trigger) return 'ไม่พบช่องวันที่';
    trigger.click();
    const dateInput = await waitFor(() => {
      const i = document.querySelector('ytcp-date-picker tp-yt-paper-input input, ytcp-date-picker input');
      return isVisible(i) && i;
    }, 5000);
    if (!dateInput) return 'เปิดปฏิทินไม่ได้';
    const dateText = formatStudioDate(date, dateInput.value);
    await typeInto(dateInput, dateText);
    if (isVisible(dateInput)) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
      await sleep(300);
    }

    const timeInput = await waitFor(() => {
      const i = dlg.querySelector('#time-of-day-container input, ytcp-datetime-picker tp-yt-paper-input input');
      return isVisible(i) && i;
    }, 4000);
    if (!timeInput) return 'ไม่พบช่องเวลา';
    const timeText = formatStudioTime(date);
    const norm = (x) => String(x).toLowerCase().replace(/[\s,.]/g, '');
    // ช่องเวลาของ Studio เป็นช่องเลือกจากรายการ (00:00, 00:15, …) พิมพ์อย่างเดียวค่าไม่ถูกบันทึก (รูป 6: ค้าง 00:00)
    // วิธีที่ 1: คลิกช่องแล้วเลือกเวลาจากรายการ  วิธีที่ 2 (เวลาที่ไม่อยู่ในรายการ เช่น 19:07): พิมพ์ + Enter + Tab
    const pickTime = async () => {
      timeInput.focus();
      timeInput.click();
      const item = await waitFor(() => [...document.querySelectorAll('tp-yt-paper-item, [role="option"], ytcp-text-menu tp-yt-paper-item')]
        .find((e) => e.getClientRects().length && norm(e.textContent) === norm(timeText)), 2500);
      if (item) {
        item.scrollIntoView({ block: 'center' });
        item.click();
        await sleep(600);
        return true;
      }
      return false;
    };
    if (!(await pickTime())) {
      await typeInto(timeInput, timeText);
      timeInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', keyCode: 9, bubbles: true }));
    }
    timeInput.blur();
    document.body.click();
    await sleep(1000); // ให้ Studio บันทึกค่า แล้วค่อยอ่านค่าที่แสดงจริง

    // ตรวจผลจากข้อความที่ Studio แสดง (หลังออกจากช่องแล้ว): วันที่และเวลาต้องตรงกับที่ตั้งทั้งหมด
    // ถ้าไม่ตรงจะถือว่าไม่สำเร็จ (ไม่กด Save) ดีกว่าเสี่ยงปล่อยผิดวัน/ผิดเวลา
    const shownDate = (dlg.querySelector('#datepicker-trigger')?.textContent || trigger.textContent || '').trim();
    const shownTime = (dlg.querySelector('#time-of-day-container input, ytcp-datetime-picker tp-yt-paper-input input')?.value || '').trim();
    if (norm(shownDate) !== norm(dateText) || norm(shownTime) !== norm(timeText)) {
      return `Studio ไม่รับวันเวลา (ตั้ง "${dateText} ${timeText}" แต่แสดง "${shownDate} ${shownTime}")`;
    }
    return '';
  }

  // ป๊อปอัปแจ้งเตือนที่ขึ้นหลังกด Save/Schedule เช่น
  // "We're still checking your content … Come back before your video is published" [Got it]
  // กดเฉพาะปุ่มรับทราบ (Got it / OK / Close) ไม่กดปุ่มที่เปลี่ยนการตัดสินใจ เช่น "Publish anyway"
  const RE_ACK = /^(got it|ok|okay|close|dismiss|เข้าใจแล้ว|รับทราบ|ตกลง|ปิด)$/i;
  function ackNoticeDialogs() {
    const main = getDialog()?.querySelector('tp-yt-paper-dialog');
    let clicked = false;
    for (const d of document.querySelectorAll('tp-yt-paper-dialog, ytcp-dialog, [role="dialog"], [role="alertdialog"]')) {
      if (d === main || !isVisible(d) || d.contains(main)) continue;
      // "We're still checking your content" และ "Video uploading … Keep this browser tab open until uploading is complete"
      if (!/still checking|checks|checking your content|before your video is published|video uploading|keep this browser tab open|once uploading|will be set to|ยังตรวจ|การตรวจสอบ|กำลังอัปโหลด/i.test(d.innerText || '')) continue;
      const btn = [...d.querySelectorAll('button')].find((b) => isVisible(b) && RE_ACK.test((b.textContent || '').trim()) && !b.disabled);
      if (btn) { btn.click(); clicked = true; }
    }
    return clicked;
  }

  // ปิดป๊อปอัปที่ Studio เด้งขึ้นหลังกด Save (แชร์วิดีโอ / ยังประมวลผลอยู่)
  function closeAfterDialogs() {
    document
      .querySelectorAll(
        ['ytcp-video-share-dialog', 'ytcp-uploads-still-processing-dialog', 'ytcp-prechecks-warning-dialog']
          .map((d) => `${d} #close-button, ${d} #close-button button, ${d} button[aria-label="Close"]`).join(', ')
      )
      .forEach((b) => isVisible(b) && b.click());
    ackNoticeDialogs();
  }

  // ปุ่มปิดหน้าต่างอัปโหลด (Studio ต.ค. 2026: ytcp-button#ytcp-uploads-dialog-close-button > button[aria-label=Close])
  function closeStudioUploadDialog() {
    const b = [...(getDialog()?.querySelectorAll('#ytcp-uploads-dialog-close-button button, #ytcp-uploads-dialog-close-button, #close-button, button[aria-label="Close"], button[aria-label="ปิด"]') || [])].find(isVisible);
    if (b) b.click();
  }

  const dialogError = () => {
    const e = getDialog()?.querySelector('.error-area, #error-message, .error-short');
    return isVisible(e) ? e.textContent.trim() : '';
  };

  // เปิดหน้าต่างอัปโหลดของ Studio แล้วคืนค่า <input type=file>
  // element ของ Studio บางตัวเป็น display:contents (ไม่มีกล่องของตัวเอง) -> ดูว่ามีลูกตัวไหนแสดงอยู่หรือเปล่า
  const shown = (el) => !!el && (isVisible(el) || [...el.querySelectorAll('*')].some((c) => c.getClientRects().length > 0));
  const byText = (sel, re) => [...document.querySelectorAll(sel)].find((e) => shown(e) && re.test((e.textContent || '').trim()));

  // เปิดหน้าต่างอัปโหลดของ Studio แล้วคืนค่า { input } หรือ { err } บอกว่าติดขั้นไหน
  // ลองหลายทางเพราะ Studio เปลี่ยนหน้าตาบ่อย: (1) หน้าต่างเปิดอยู่แล้ว (2) ปุ่ม Create → Upload videos (3) ปุ่ม Upload ในหน้า Dashboard/Content
  async function openFilePicker() {
    if (ackNoticeDialogs()) await sleep(800); // ป๊อปอัป "Video uploading" ของคลิปก่อนหน้าบังหน้าจออยู่
    const fileInput = () => {
      const dlg = getDialog();
      if (!dlg) return null;
      const input = dlg.querySelector('ytcp-uploads-file-picker input[type=file], input[type=file][name="Filedata"], input[type=file]');
      // หน้าต่างต้องอยู่ที่หน้าจอ "เลือกไฟล์" (ไม่ใช่หน้ากรอกรายละเอียดของคลิปก่อน)
      const pickerShown = shown(dlg.querySelector('ytcp-uploads-file-picker')) || shown(dlg.querySelector('#select-files-button'));
      return input && pickerShown && !detailsOpen() ? input : null;
    };
    if (fileInput()) return { input: fileInput() };

    const steps = [];
    // (2) ปุ่ม Create (ไอคอนกล้อง/บวก มุมขวาบน)
    const create = [...document.querySelectorAll(
      '#create-icon, ytcp-button#create-icon, ytcp-icon-button#create-icon, button[aria-label="Create"], button[aria-label="สร้าง"], ytcp-button[aria-label="Create"], ytcp-button[aria-label="สร้าง"]'
    )].find(shown);
    if (create) {
      (create.querySelector('button') || create).click();
      const item = await waitFor(() =>
        byText('tp-yt-paper-item, ytcp-text-menu [role="menuitem"], [role="menuitem"]', /^(upload videos?|อัปโหลดวิดีโอ)$/i) ||
        [...document.querySelectorAll('tp-yt-paper-item#text-item-0, #text-item-0')].find(shown), 4000);
      if (item) {
        item.click();
        const input = await waitFor(fileInput, 10000);
        if (input) return { input };
        steps.push('กดเมนู "อัปโหลดวิดีโอ" แล้วแต่หน้าต่างไม่ขึ้น');
      } else {
        document.body.click();
        steps.push('กดปุ่ม Create แล้วแต่ไม่เจอเมนู "อัปโหลดวิดีโอ"');
      }
    } else steps.push('ไม่เจอปุ่ม Create');

    // (3) ปุ่ม Upload ในหน้า Dashboard / Content
    const up = [...document.querySelectorAll('#upload-icon, #upload-button, ytcp-button#upload-button, ytcp-icon-button#upload-icon')].find(shown) ||
      byText('ytcp-button, button', /^(upload videos?|อัปโหลดวิดีโอ)$/i);
    if (up) {
      (up.querySelector('button') || up).click();
      const input = await waitFor(fileInput, 10000);
      if (input) return { input };
      steps.push('กดปุ่ม Upload แล้วแต่หน้าต่างไม่ขึ้น');
    } else steps.push('ไม่เจอปุ่ม Upload');

    return { err: steps.join(' · ') };
  }

  // ส่งไฟล์ให้หน้าต่างอัปโหลดโดยไม่ต้องเปิดหน้าต่างเลือกไฟล์ของ Windows
  // วิธีที่ 1: ใส่ไฟล์ลง <input type=file> แล้วยิง event change
  // วิธีที่ 2: จำลองการลากไฟล์มาวางบนพื้นที่ "Drag and drop" (Studio รองรับการลากวางอยู่แล้ว)
  // ถือว่าสำเร็จเมื่อหน้าต่างออกจากหน้าจอ "เลือกไฟล์" (ขึ้นหน้ากรอกรายละเอียด / แถบอัปโหลด / ข้อความผิดพลาด)
  async function injectUploadFile(input, file) {
    const dlg = getDialog();
    const picker = () => dlg.querySelector('ytcp-uploads-file-picker');
    const accepted = () => detailsOpen() || !!dialogError() || !shown(picker());
    const makeDT = () => {
      const dt = new DataTransfer();
      dt.items.add(file);
      return dt;
    };
    injectingFile = true;
    try {
      await sleep(800); // ให้หน้าต่างเล่นแอนิเมชันเปิดจนเสร็จก่อน
      for (let round = 0; round < 3; round++) {
        const inp = dlg.querySelector('input[type=file][name="Filedata"]') || input; // Studio อาจสร้าง input ใหม่
        inp.files = makeDT().files;
        inp.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        if (await waitFor(accepted, 5000)) return true;
        if (/invalid file format|รูปแบบไฟล์ไม่ถูกต้อง/i.test(dlg.innerText || '')) return true; // Studio รับแล้วแต่ไฟล์ใช้ไม่ได้ -> แจ้งด้วย dialogError
      }

      // วิธีที่ 2
      const zone = picker()?.querySelector('#content') || picker() || dlg;
      const r = zone.getBoundingClientRect();
      const base = { bubbles: true, cancelable: true, composed: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
      for (const type of ['dragenter', 'dragover', 'drop']) {
        zone.dispatchEvent(new DragEvent(type, Object.assign({ dataTransfer: makeDT() }, base)));
        await sleep(150);
      }
      return !!(await waitFor(accepted, 8000));
    } finally {
      injectingFile = false;
    }
  }

  // เก็บข้อมูลโครงสร้างหน้าต่างอัปโหลด (ส่วนภาพปก / ช่องเลือกไฟล์ / ปุ่ม) สำหรับหาสาเหตุ
  function diagnoseUploadDialog() {
    const dlg = getDialog();
    if (!dlg || !detailsOpen()) return { error: 'ยังไม่ได้เปิดหน้ากรอกรายละเอียด — เลือกไฟล์ในหน้าต่างอัปโหลดก่อน แล้วกดใหม่' };
    const path = (e) => {
      const c = [];
      for (let p = e, i = 0; p && p !== dlg && i < 8; i++) {
        c.push(p.tagName.toLowerCase() + (p.id ? '#' + p.id : ''));
        p = p.parentElement || (p.getRootNode() && p.getRootNode().host);
      }
      return c.join(' < ');
    };
    const desc = (e) => ({ path: path(e), shown: shown(e), aria: e.getAttribute('aria-label') || '', text: (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60) });
    const all = [...dlg.querySelectorAll('*')];
    return {
      version: GM_info && GM_info.script ? GM_info.script.version : '',
      lang: document.documentElement.lang,
      fileInputs: [...dlg.querySelectorAll('input[type=file]')].map((i) => Object.assign(desc(i), { name: i.name, id: i.id, accept: i.accept })),
      thumbTags: [...new Set(all.map((e) => e.tagName.toLowerCase()).filter((t) => /thumb|still/.test(t)))],
      thumbIds: all.filter((e) => /thumb|still/i.test(e.id)).slice(0, 15).map(desc),
      thumbButtons: all.filter((e) => /^(button|ytcp-button|tp-yt-paper-button)$/i.test(e.tagName) &&
        /upload|thumbnail|ภาพปก|ภาพขนาดย่อ|อัปโหลดไฟล์/i.test((e.getAttribute('aria-label') || '') + ' ' + (e.textContent || ''))).slice(0, 10).map(desc),
      thumbImgs: all.filter((e) => e.tagName === 'IMG' && e.closest(THUMB_AREA)).slice(0, 8).map((i) => ({ path: path(i), src: String(i.src).slice(0, 40) })),
      areaFound: !!dlg.querySelector(THUMB_AREA),
    };
  }

  // ข้อความสถานะการอัปโหลดในหน้าต่าง เช่น "Uploading 45% … 3 minutes left" / "Upload complete"
  function uploadProgressText() {
    const el = getDialog()?.querySelector('ytcp-video-upload-progress, .progress-label, ytcp-video-upload-progress-hover');
    return el ? (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60) : '';
  }

  // ===== ช่องที่กำลังใช้งาน (กันอัปผิดช่อง) =====
  function getChannel() {
    const W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    const id = (location.pathname.match(/\/channel\/(UC[\w-]{10,})/) || [])[1] || (W.ytcfg && W.ytcfg.get('CHANNEL_ID')) || '';
    const nameEl = document.querySelector('ytcp-navigation-drawer #entity-name, #entity-name');
    const imgEl = document.querySelector(
      'ytcp-navigation-drawer #avatar img, ytcp-navigation-drawer img.image-thumbnail, ytcp-navigation-drawer img, #avatar-btn img'
    );
    return { id, name: nameEl ? nameEl.textContent.trim() : '', avatar: imgEl && imgEl.src ? imgEl.src : '' };
  }
  const chanLabel = (c) => c.name || c.id || 'ไม่ทราบช่อง';
  // คืนค่า '' ถ้าอัปได้ หรือข้อความเตือนถ้าไม่ตรงกับช่องที่ล็อกไว้
  function channelProblem() {
    const lock = settings.lockChannel;
    if (!lock) return '';
    const cur = getChannel();
    if (!cur.id) return `ตรวจไม่พบช่องปัจจุบัน (ล็อกไว้ที่ "${lock.name}")`;
    return cur.id === lock.id ? '' : `ตอนนี้อยู่ช่อง "${chanLabel(cur)}" แต่ล็อกไว้ที่ "${lock.name}"`;
  }

  // ===== คิวอัปโหลด =====
  /** @type {{id:number,file:File,presetId:string,n:number,title:string,titleEdited:boolean,status:string,msg:string,ui?:any}[]} */
  const queue = [];
  let qid = 0;
  let running = false;
  let stopReq = false;

  const STATUS = {
    pending: ['รอคิว', 'muted'],
    uploading: ['กำลังทำงาน', 'info'],
    review: ['รอคุณกด Save', 'warn'],
    done: ['เสร็จแล้ว', 'ok'],
    error: ['ผิดพลาด', 'err'],
  };

  const isVideo = (f) => (f.type || '').startsWith('video/') || VIDEO_EXT.test(f.name);
  const isTxt = (f) => TXT_EXT.test(f.name);
  const isImg = (f) => (f.type || '').startsWith('image/') || IMG_EXT.test(f.name);
  const baseKey = (name) => name.replace(/\.[^.]+$/, '').trim().toLowerCase();

  // อ่าน .txt เป็น UTF-8 ถ้าอ่านแล้วเพี้ยนให้ลองแบบภาษาไทยของ Windows (windows-874)
  async function readText(file) {
    const buf = await file.arrayBuffer();
    const utf8 = new TextDecoder('utf-8').decode(buf).replace(/^﻿/, '');
    return utf8.includes('�') ? new TextDecoder('windows-874').decode(buf) : utf8;
  }

  async function attachTxt(it, file) {
    it.txt = await readText(file);
    it.txtName = file.name;
  }
  function attachThumb(it, file) {
    it.thumb = file;
  }

  // รับไฟล์ปนกันได้: คลิป + .txt + ภาพปก จับคู่ด้วยชื่อไฟล์ (ไม่รวมนามสกุล)
  async function addFiles(fileList) {
    const files = [...fileList];
    const vids = files.filter(isVideo);
    for (const file of vids) {
      queue.push({ id: ++qid, file, presetId: activeId, n: 0, title: '', titleEdited: false, status: 'pending', msg: '', txt: '', txtName: '', thumb: null });
    }
    const byKey = new Map();
    for (const it of queue) if (it.status !== 'done') byKey.set(baseKey(it.file.name), it);

    let txtN = 0, imgN = 0, unmatched = 0, skipped = 0;
    for (const f of files) {
      if (isVideo(f)) continue;
      const it = byKey.get(baseKey(f.name));
      if (isTxt(f) || isImg(f)) {
        if (!it) { unmatched++; continue; }
        if (isTxt(f)) { await attachTxt(it, f); txtN++; }
        else { attachThumb(it, f); imgN++; }
        it.titleEdited = false;
      } else skipped++;
    }

    const parts = [];
    if (vids.length) parts.push(`เพิ่ม ${vids.length} คลิป`);
    if (txtN) parts.push(`คำอธิบาย .txt ${txtN} ไฟล์`);
    if (imgN) parts.push(`ภาพปก ${imgN} ไฟล์`);
    if (unmatched) parts.push(`ไม่มีคลิปชื่อตรงกัน ${unmatched} ไฟล์`);
    if (skipped) parts.push(`ข้าม ${skipped} ไฟล์`);
    if (parts.length) toast(parts.join(' · '));
    renderQueue();
  }

  // แจกเลข {n} ตามลำดับในคิว แยกตามพรีเซ็ต แล้วสร้างชื่อใหม่ให้คลิปที่ยังไม่ได้แก้ชื่อเอง
  function assignNumbers() {
    const next = {};
    for (const it of queue) {
      const base = next[it.presetId] ?? (counters[it.presetId] || 0);
      if (it.status === 'uploading' || it.status === 'review') {
        next[it.presetId] = Math.max(base, it.n);
      } else if (it.status === 'pending' || it.status === 'error') {
        it.n = base + 1;
        next[it.presetId] = it.n;
        if (!it.titleEdited) it.title = makeTitle(presetById(it.presetId), itemVars(it));
      }
    }
  }

  // เวลาปล่อยของแต่ละคลิป: แก้เองในการ์ด หรือคำนวณจากเวลาเริ่ม + ลำดับในคิว x ระยะห่าง
  const scheduleOn = () => settings.schedule.on && !!settings.schedule.start;
  const stepMs = () => Math.max(1, Number(settings.schedule.every) || 1) * (settings.schedule.unit === 'hour' ? 3600e3 : 86400e3);
  // คลิปที่อัปเสร็จจะจำเวลาไว้ (publishFinal) และเลื่อนเวลาเริ่มไปช่องถัดไป -> ล้างรายการแล้วเพิ่มใหม่ เวลาจะไม่ชนของเดิม
  function itemPublishAt(it) {
    if (it.publishFinal) return it.publishFinal;
    if (!scheduleOn()) return null;
    if (it.publishEdited && it.publishAt) return it.publishAt;
    const start = new Date(settings.schedule.start).getTime();
    if (!start) return null;
    const k = queue.filter((x) => ['pending', 'uploading', 'review'].includes(x.status) && !(x.publishEdited && x.publishAt)).indexOf(it);
    return k < 0 ? null : start + k * stepMs();
  }
  const scheduleProblem = (at) => (at && at < Date.now() + SCHEDULE_MIN_LEAD ? 'เวลาปล่อยต้องอยู่ในอนาคตอย่างน้อย 15 นาที' : '');
  const fmtWhen = (ms) =>
    new Intl.DateTimeFormat('th-TH-u-ca-gregory', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(ms);
  // แปลง ms <-> ค่าของ <input type=datetime-local> ตามเวลาเครื่อง
  const toLocalInput = (ms) => {
    const d = new Date(ms);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const itemVars = (it) =>
    buildVars(it.file.name, it.n, it.txt, { preset: presetById(it.presetId), artists: it.artistsEdited ? it.artists : '' });

  function setItem(it, status, msg = '') {
    it.status = status;
    it.msg = msg;
    updateItemUI(it);
    updateRunUI();
  }

  async function uploadOne(it) {
    const p = presetById(it.presetId);
    const vars = itemVars(it);
    const title = it.titleEdited ? it.title.slice(0, TITLE_MAX) : makeTitle(p, vars);

    const publishAt = itemPublishAt(it);
    if (scheduleProblem(publishAt)) throw new Error(`${scheduleProblem(publishAt)} (${fmtWhen(publishAt)})`);
    if (uploadDialogOpen()) throw new Error('มีหน้าต่างอัปโหลดค้างอยู่ ปิดก่อนแล้วกดเริ่มใหม่');
    setItem(it, 'uploading', 'กำลังเปิดหน้าต่างอัปโหลด…');
    const { input, err: pickErr } = await openFilePicker();
    if (!input) {
      throw new Error(`เปิดหน้าต่างอัปโหลดของ Studio ไม่ได้ (${pickErr}) — ลองเปิดหน้าต่างอัปโหลดเองค้างไว้ที่หน้า "เลือกไฟล์" แล้วกด "ลองใหม่" สคริปต์จะใช้หน้าต่างนั้นต่อ`);
    }

    if (!(await injectUploadFile(input, it.file))) {
      closeStudioUploadDialog();
      throw new Error('Studio ไม่รับไฟล์ที่สคริปต์ส่งให้ (ทั้งแบบเลือกไฟล์และแบบลากวาง) — ส่งข้อความนี้ให้ผู้พัฒนาสคริปต์');
    }

    setItem(it, 'uploading', 'กำลังอัปโหลดและกรอกรายละเอียด…');
    const titleBox = await waitFor(() => {
      const t = getTitleBox(getDialog());
      return (isVisible(t) && t) || (dialogError() && 'error');
    }, 60000);
    if (!titleBox || titleBox === 'error') throw new Error(dialogError() || 'ไม่พบหน้ากรอกรายละเอียด');
    await waitFor(() => titleBox.textContent.trim(), 8000); // รอ Studio ใส่ชื่อไฟล์ก่อน จะได้ไม่ทับของเรา
    await sleep(800);

    const description = renderDesc(p, vars);
    const tagsOk = await fillDetails({ title, description, tags: renderTags(p, vars) });
    it.draftId = dialogVideoId(); // อาจยังไม่มีลิงก์ จะอ่านซ้ำก่อนกด Save
    const vis = p.visibility || 'PRIVATE';
    let note = tagsOk ? '' : ' (หาช่องแท็กไม่เจอ)';
    if (settings.thumb && it.thumb) {
      // Studio เปิดให้ใส่ภาพปกหลังวิดีโออัปขึ้นไปแล้ว -> ลองทุก ~10 วินาทีจนสำเร็จ หรือครบเวลาที่ตั้งไว้
      const t0 = Date.now();
      const limit = Math.max(1, Number(settings.thumbWaitMin) || 120) * 60e3;
      let err = '';
      for (let round = 1; ; round++) {
        const prog = uploadProgressText();
        setItem(it, 'uploading', `รอใส่ภาพปก (รอบที่ ${round})${prog ? ' · ' + prog : ''}`);
        err = await setThumbnail(it.thumb, 3000);
        if (!err || /2MB|ชนิดไฟล์/.test(err) || stopReq || !detailsOpen() || Date.now() - t0 > limit) break;
        await sleep(7000);
      }
      if (err) note += ` (ภาพปก: ${err}${Date.now() - t0 > limit ? ` · รอเกิน ${settings.thumbWaitMin} นาที` : ''})`;
    }

    // ตั้งเวลาปล่อย: ไปหน้า Visibility แล้วกรอกวัน/เวลา (คลิปจะเป็นส่วนตัวจนถึงเวลาที่ตั้ง)
    if (publishAt) {
      setItem(it, 'uploading', `กำลังตั้งเวลาปล่อย ${fmtWhen(publishAt)}…`);
      if (!(await goToVisibility(null))) throw new Error('ไปหน้า Visibility ไม่สำเร็จ');
      await sleep(600);
      const err = await setSchedule(new Date(publishAt));
      if (err) throw new Error('ตั้งเวลาไม่สำเร็จ: ' + err);
    }
    const visText = publishAt ? `⏰ ปล่อย ${fmtWhen(publishAt)}` : VIS[vis];

    if (settings.autoSave) {
      setItem(it, 'uploading', 'กำลังบันทึก…');
      if (!publishAt && !(await goToVisibility(vis))) throw new Error('ไปหน้า Visibility ไม่สำเร็จ');
      await sleep(600);
      // ปุ่ม Save/Schedule: ytcp-button#done-button > button (กดตัว button ข้างใน)
      const done = await waitFor(() => {
        const host = getDialog()?.querySelector('#done-button');
        const b = host && (host.querySelector('button') || host);
        return isVisible(host) && !host.hasAttribute('disabled') && !b.disabled && b.getAttribute('aria-disabled') !== 'true' && b;
      }, 20000);
      if (!done) throw new Error('กดปุ่ม Save ไม่ได้ (ปุ่มยังกดไม่ได้ — อาจยังมีขั้นที่ต้องตอบ)');
      it.draftId = it.draftId || dialogVideoId();
      setItem(it, 'uploading', 'กด Save แล้ว รอหน้าต่างปิด…');
      done.click();
      // หลังกด Save/Schedule อาจมีป๊อปอัปแจ้งเตือน เช่น "We're still checking your content" (ปุ่ม Got it) -> กดรับทราบให้
      const closedOk = () => { ackNoticeDialogs(); return !uploadDialogOpen(); };
      if (!(await waitFor(closedOk, 30000, 500))) {
        // บางครั้งต้องกดซ้ำ (เช่น Studio ยังบันทึกข้อมูลก่อนหน้าอยู่)
        if (isVisible(done)) done.click();
        if (!(await waitFor(closedOk, 30000, 500))) throw new Error('กด Save แล้วแต่หน้าต่างไม่ปิด — กด Save เองในหน้าต่าง แล้วกดลองใหม่');
      }
    } else {
      if (settings.autoNext && !publishAt) await goToVisibility(vis);
      setItem(it, 'review', 'ตรวจข้อมูลในหน้าต่าง YouTube แล้วกด Save เพื่อไปไฟล์ถัดไป' + note);
      await waitFor(() => (it.draftId = it.draftId || dialogVideoId()) || !uploadDialogOpen(), 20000, 500);
      await waitFor(() => { ackNoticeDialogs(); return !uploadDialogOpen() || stopReq; }, 3600000, 1000);
      if (uploadDialogOpen()) throw new Error('หยุดคิวแล้ว');
    }
    await sleep(1500);
    closeAfterDialogs();

    counters[p.id] = Math.max(counters[p.id] || 0, it.n);
    save('counters', counters);
    if (publishAt) {
      it.publishFinal = publishAt;
      if (!it.publishEdited) {
        settings.schedule.start = toLocalInput(publishAt + stepMs()); // คลิปถัดไปต่อจากคลิปนี้
        saveSettings();
      }
    }
    const videoId = it.draftId || '';
    logUpload({ videoId, title, file: it.file.name, size: it.file.size, txt: vars.txt, description, publishAt, visibility: publishAt ? 'SCHEDULED' : vis });
    it.videoId = videoId;
    setItem(it, 'done', `${title} · ${visText}${note}`);
    if (typeof syncScheduleInput === 'function') syncScheduleInput();
  }

  // รหัสวิดีโอจากลิงก์ในหน้าต่างอัปโหลด (youtu.be/xxxx)
  function dialogVideoId() {
    const a = getDialog()?.querySelector('ytcp-video-info a[href*="youtu"], .video-url-fadeable a[href*="youtu"], a[href*="youtu.be/"]');
    const m = a && a.href.match(/(?:youtu\.be\/|\/video\/|[?&]v=|\/shorts\/)([\w-]{11})/);
    return m ? m[1] : '';
  }

  // ประวัติการอัปโหลด (ใช้ตอนแก้ tracklist หลังตัดลิขสิทธิ์ และดูว่าคลิปไหนตั้งเวลาไว้)
  const getUploads = () => load('uploads', []);
  function logUpload(rec) {
    const ch = getChannel();
    const list = getUploads();
    list.unshift(Object.assign({ date: new Date().toISOString(), channel: ch.id, channelName: chanLabel(ch) }, rec));
    save('uploads', list.slice(0, 1000));
  }
  const uploadOf = (videoId) => (videoId ? getUploads().find((u) => u.videoId === videoId) : null);
  function uploadsCSV() {
    const head = ['date', 'channel', 'title', 'file', 'video_id', 'url', 'visibility', 'publish_at'];
    const rows = getUploads().map((u) => [u.date, u.channelName || u.channel, u.title, u.file, u.videoId,
      u.videoId ? 'https://youtu.be/' + u.videoId : '', u.visibility, u.publishAt ? new Date(u.publishAt).toISOString() : '']);
    downloadCSV([head, ...rows], `uploads-${new Date().toISOString().slice(0, 10)}.csv`);
  }
  function downloadCSV(rows, name) {
    const csv = '\ufeff' + rows.map((r) => r.map((v) => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
  }

  async function runQueue() {
    if (running) return;
    const pendingN = queue.filter((i) => i.status === 'pending').length;
    if (!pendingN) return toast('ไม่มีคลิปที่รอคิว');
    const problem = channelProblem();
    if (problem) {
      openDrawer();
      return toast('⛔ ' + problem);
    }
    const ch = getChannel();
    if (settings.confirmStart && !confirm(`อัปโหลด ${pendingN} คลิป ไปที่ช่อง:\n\n📺 ${chanLabel(ch)}${ch.id ? `\n(${ch.id})` : ''}\n\nถูกช่องใช่ไหม?`)) return;
    running = true;
    stopReq = false;
    updateRunUI();
    let ok = 0;
    try {
      while (!stopReq) {
        assignNumbers();
        const it = queue.find((i) => i.status === 'pending');
        if (!it) break;
        const problem = channelProblem();
        if (problem) {
          toast('⛔ หยุดคิว: ' + problem);
          break;
        }
        try {
          await uploadOne(it);
          ok++;
        } catch (e) {
          console.error('[YT Presets]', e);
          it.draftId = it.draftId || dialogVideoId();
          setItem(it, 'error', e.message + (it.draftId ? ` · ไฟล์ขึ้นไปเป็นฉบับร่างแล้ว (${it.draftId}) ลบใน Content ก่อนกดลองใหม่ จะได้ไม่ซ้ำ` : ''));
          closeStudioUploadDialog();
          if (/limit|ขีดจำกัด|daily/i.test(e.message)) break;
        }
        if (!stopReq && queue.some((i) => i.status === 'pending')) await sleep(settings.delay * 1000);
      }
    } finally {
      running = false;
      assignNumbers();
      renderQueue();
      toast(stopReq ? `หยุดคิวแล้ว (สำเร็จ ${ok} คลิป)` : `คิวเสร็จแล้ว สำเร็จ ${ok} คลิป ✅`);
    }
  }

  // ดักการเลือก/ลากหลายไฟล์ในหน้าต่างของ Studio -> ส่งเข้าคิวของสคริปต์แทน
  document.addEventListener(
    'change',
    (e) => {
      const t = e.target;
      if (!settings.intercept || !(t instanceof HTMLInputElement) || t.type !== 'file') return;
      if (!t.closest('ytcp-uploads-dialog') || t.files.length < 2) return;
      e.stopImmediatePropagation();
      addFiles(t.files);
      t.value = '';
      closeStudioUploadDialog();
      openDrawer('queue');
    },
    true
  );
  document.addEventListener(
    'drop',
    (e) => {
      if (injectingFile || !settings.intercept || !e.target.closest?.('ytcp-uploads-dialog')) return;
      const files = e.dataTransfer?.files;
      if (!files || files.length < 2) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      addFiles(files);
      closeStudioUploadDialog();
      openDrawer('queue');
    },
    true
  );

  // ===== โหมดอัปโหลดเองทีละไฟล์: เติมข้อมูลอัตโนมัติ =====
  let session = null;

  async function applyToOpenDialog() {
    if (!detailsOpen()) return toast('ยังไม่ได้เปิดหน้ากรอกรายละเอียดของ YouTube');
    const p = active();
    if (!session) session = { originalName: getTitleBox(getDialog()).textContent.trim(), n: 0 };
    session.n = session.n || (counters[p.id] || 0) + 1;
    const vars = buildVars(session.originalName, session.n, '', { preset: p });
    const title = makeTitle(p, vars);
    const tagsOk = await fillDetails({ title, description: renderDesc(p, vars), tags: renderTags(p, vars) });
    counters[p.id] = Math.max(counters[p.id] || 0, session.n);
    save('counters', counters);
    if (settings.autoNext) await goToVisibility(p.visibility || 'PRIVATE');
    toast(`ใส่ข้อมูลแล้ว: ${title}${tagsOk ? '' : ' (หาช่องแท็กไม่เจอ)'}`);
    renderPresetPreview();
  }

  setInterval(async () => {
    if (running) return;
    if (!uploadDialogOpen()) {
      session = null;
      return;
    }
    if (session || !detailsOpen()) return;
    const s = (session = { originalName: '', n: 0 });
    const titleBox = getTitleBox(getDialog());
    s.originalName = (await waitFor(() => titleBox.textContent.trim(), 8000)) || '';
    const problem = channelProblem();
    if (problem) toast('⚠️ ระวังอัปผิดช่อง: ' + problem);
    if (session === s && settings.autoApply && !running && !problem) {
      await sleep(800);
      if (session === s) applyToOpenDialog();
    }
  }, 1000);

  window.addEventListener('beforeunload', (e) => {
    if (running || queue.some((i) => i.status === 'pending' || i.status === 'error')) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // ===== UI =====
  // Studio ใช้ Trusted Types จึงสร้าง DOM ด้วย createElement แทน innerHTML
  function h(tag, props = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null) continue;
      if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k in el) el[k] = v;
      else el.setAttribute(k, v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) el.append(c);
    return el;
  }

  // ไอคอนเส้น (SVG) ชุดเดียวกันทั้งแผง
  const ICONS = {
    play: 'M7 4.5v15l12.5-7.5z',
    upload: 'M12 15V3M7 8l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4',
    queue: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
    layers: 'M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
    sliders: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
    lock: 'M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1zM8 11V7a4 4 0 0 1 8 0v4',
    unlock: 'M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1zM8 11V7a4 4 0 0 1 7.6-1.7',
    x: 'M18 6 6 18M6 6l12 12',
    stop: 'M7 7h10v10H7z',
    clear: 'M3 6h18M8 6V4h8v2M6 6l1 14a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-14',
    refresh: 'M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.2L3 16M3 21v-5h5',
    clip: 'M21 11.5 12.5 20a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6L15 7',
    file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6',
    image: 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM3 16l5-5 4 4 3-3 6 6M15.5 9.5h.01',
    film: 'M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4',
    plus: 'M12 5v14M5 12h14',
    copy: 'M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
    star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3l-5.5 2.9 1-6.2L3 9.6l6.2-.9z',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    alert: 'M12 9v4M12 17h.01M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
    send: 'M5 12h14M13 6l6 6-6 6',
    tv: 'M3 6h18a0 0 0 0 1 0 0v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM8 21h8M12 18v3',
    clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3.5 2',
    shield: 'M12 3l8 3v6c0 4.8-3.4 8.3-8 9-4.6-.7-8-4.2-8-9V6z',
  };
  const FILLED = new Set(['play', 'stop', 'star']);
  function icon(name, size = 16) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.setAttribute('class', 'ic');
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', ICONS[name]);
    if (FILLED.has(name)) path.setAttribute('fill', 'currentColor');
    else {
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'currentColor');
      path.setAttribute('stroke-width', '1.8');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
    }
    svg.append(path);
    return svg;
  }
  const iconBtn = (name, title, onclick, cls = '') => h('button', { className: 'ib ' + cls, title, onclick }, icon(name));

  GM_addStyle(`
    #ytp-root{
      --bg:#ffffff;--surface:#f7f7f9;--surface2:#efeff3;--line:#e4e4ea;--line2:#d6d6de;
      --fg:#111114;--fg2:#5d5d6b;--fg3:#8d8d9a;
      --brand:#ff2d55;--brand2:#ff6a3d;--focus:#3b82f6;
      --ok:#16a34a;--warn:#d97706;--err:#dc2626;--info:#2563eb;--muted:#9a9aa6;
      --shadow:0 24px 60px -12px rgba(15,15,25,.28),0 2px 6px rgba(15,15,25,.06);
      --radius:14px;
      font:13px/1.5 "Inter","IBM Plex Sans Thai","Noto Sans Thai",Roboto,system-ui,sans-serif;color:var(--fg);
      -webkit-font-smoothing:antialiased;letter-spacing:.005em}
    #ytp-root.dark{
      --bg:#0e0e12;--surface:#16161c;--surface2:#1d1d25;--line:#26262f;--line2:#33333e;
      --fg:#ededf2;--fg2:#a3a3b2;--fg3:#6f6f7d;
      --ok:#22c55e;--warn:#f59e0b;--err:#f43f5e;--info:#60a5fa;--muted:#6f6f7d;
      --shadow:0 24px 70px -10px rgba(0,0,0,.7),0 0 0 1px rgba(255,255,255,.04)}
    #ytp-root *{box-sizing:border-box}
    #ytp-root [hidden]{display:none!important}
    #ytp-root .ic{flex:0 0 auto;display:block}
    #ytp-root button{font-family:inherit}
    #ytp-root .mono{font-family:"JetBrains Mono","SF Mono",Consolas,monospace;font-size:11px}

    /* ---------- FAB ---------- */
    #ytp-root .fab{position:fixed;left:18px;bottom:18px;z-index:100001;display:flex;align-items:center;gap:10px;
      background:#0e0e12;color:#fff;border:1px solid #2a2a33;border-radius:16px;padding:8px 14px 8px 8px;cursor:pointer;
      box-shadow:0 10px 30px -6px rgba(0,0,0,.45);transition:transform .15s,box-shadow .15s;text-align:left}
    #ytp-root .fab:hover{transform:translateY(-2px);box-shadow:0 16px 36px -8px rgba(0,0,0,.55)}
    #ytp-root .fab .logo{width:34px;height:34px}
    #ytp-root .fab .fcol{display:flex;flex-direction:column;min-width:0;max-width:220px;line-height:1.25}
    #ytp-root .fab .fch{font-size:11px;color:#a3a3b2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #ytp-root .fab .fpr{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #ytp-root .fab .badge{background:linear-gradient(135deg,var(--brand),var(--brand2));color:#fff;border-radius:999px;
      padding:2px 8px;font-size:11px;font-weight:700;font-variant-numeric:tabular-nums}
    #ytp-root .fab.bad{border-color:var(--err);box-shadow:0 0 0 3px rgba(244,63,94,.35),0 10px 30px -6px rgba(0,0,0,.45)}
    #ytp-root .fab.bad .fch{color:#fda4af}

    #ytp-root .logo{display:grid;place-items:center;border-radius:10px;color:#fff;flex:0 0 auto;
      background:linear-gradient(135deg,var(--brand),var(--brand2));box-shadow:inset 0 1px 0 rgba(255,255,255,.25)}

    /* ---------- Drawer ---------- */
    #ytp-root .drawer{position:fixed;top:12px;right:12px;bottom:12px;z-index:100000;width:min(460px,calc(100vw - 24px));
      background:var(--bg);border:1px solid var(--line);border-radius:20px;box-shadow:var(--shadow);
      display:flex;flex-direction:column;overflow:hidden;
      transform:translateX(calc(100% + 24px));transition:transform .28s cubic-bezier(.2,.8,.2,1)}
    #ytp-root .drawer.open{transform:none}
    #ytp-root .hd{display:flex;align-items:center;gap:12px;padding:16px 16px 12px}
    #ytp-root .hd .logo{width:38px;height:38px;border-radius:11px}
    #ytp-root .hd .tt{flex:1;min-width:0}
    #ytp-root .hd .tt b{display:block;font-size:15px;font-weight:700;letter-spacing:-.01em}
    #ytp-root .hd .tt span{font-size:12px;color:var(--fg3)}
    #ytp-root .ib{display:grid;place-items:center;width:32px;height:32px;border-radius:9px;border:1px solid transparent;
      background:none;color:var(--fg2);cursor:pointer;transition:.15s;flex:0 0 auto}
    #ytp-root .ib:hover{background:var(--surface2);color:var(--fg)}
    #ytp-root .ib:disabled{opacity:.35;cursor:default;background:none}
    #ytp-root .ib.outline{border-color:var(--line)}
    #ytp-root .ib.danger:hover{color:var(--err)}

    /* ---------- Channel ---------- */
    #ytp-root .chan{display:flex;gap:12px;align-items:center;margin:0 16px 12px;padding:10px 10px 10px 12px;border-radius:var(--radius);
      background:var(--surface);border:1px solid var(--line)}
    #ytp-root .chan .av{position:relative;width:40px;height:40px;flex:0 0 auto}
    #ytp-root .chan .av img,#ytp-root .chan .av .ph{width:40px;height:40px;border-radius:50%;object-fit:cover;display:grid;place-items:center;
      background:var(--surface2);color:var(--fg3)}
    #ytp-root .chan .av::after{content:"";position:absolute;right:-1px;bottom:-1px;width:12px;height:12px;border-radius:50%;
      background:var(--ok);border:2px solid var(--surface)}
    #ytp-root .chan .ct{flex:1;min-width:0}
    #ytp-root .chan .cap{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--fg3)}
    #ytp-root .chan .nm{font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #ytp-root .chan .id{color:var(--fg3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #ytp-root .chan .lk{display:flex;align-items:center;gap:6px;border:1px solid var(--line2);background:var(--bg);color:var(--fg2);
      border-radius:10px;padding:7px 10px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;transition:.15s}
    #ytp-root .chan .lk:hover{color:var(--fg);border-color:var(--fg3)}
    #ytp-root .chan.locked .lk{color:var(--ok);border-color:color-mix(in srgb,var(--ok) 45%,transparent);
      background:color-mix(in srgb,var(--ok) 10%,var(--bg))}
    #ytp-root .chan.bad{border-color:var(--err);background:color-mix(in srgb,var(--err) 9%,var(--bg))}
    #ytp-root .chan.bad .av::after{background:var(--err)}
    #ytp-root .chan.bad .id{color:var(--err);font-family:inherit;font-size:12px;font-weight:600;white-space:normal}

    /* ---------- Tabs ---------- */
    #ytp-root .tabs{display:flex;gap:4px;margin:0 16px;padding:4px;border-radius:12px;background:var(--surface);border:1px solid var(--line)}
    #ytp-root .tabs button{flex:1;display:flex;align-items:center;justify-content:center;gap:7px;border:0;background:none;color:var(--fg2);
      padding:8px 6px;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;transition:.15s}
    #ytp-root .tabs button:hover{color:var(--fg)}
    #ytp-root .tabs button.on{background:var(--bg);color:var(--fg);box-shadow:0 1px 3px rgba(0,0,0,.12),0 0 0 1px var(--line)}
    #ytp-root .tabs button{white-space:nowrap;min-width:0}
    #ytp-root #tbx-modal .btn.go{flex:0 0 auto;justify-content:center;padding:8px 16px}
    #ytp-root .row .mut{white-space:nowrap}
    #ytp-root .tabs .n{min-width:18px;padding:0 6px;border-radius:999px;background:var(--brand);color:#fff;font-size:10.5px;line-height:18px}
    #ytp-root .tabs .n:empty{display:none}

    #ytp-root .body{flex:1;overflow:auto;padding:14px 16px 18px;scrollbar-width:thin;scrollbar-color:var(--line2) transparent}
    #ytp-root .ft{display:flex;gap:8px;align-items:center;padding:12px 16px;border-top:1px solid var(--line);background:var(--bg)}

    /* ---------- Buttons ---------- */
    #ytp-root .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:1px solid var(--line2);border-radius:11px;
      padding:9px 14px;font-weight:600;font-size:13px;cursor:pointer;background:var(--bg);color:var(--fg);transition:.15s;white-space:nowrap}
    #ytp-root .btn:hover{background:var(--surface)}
    #ytp-root .btn:disabled{opacity:.45;cursor:default}
    #ytp-root .btn.sm{padding:6px 10px;font-size:12px;border-radius:9px}
    #ytp-root .btn.ghost{border-color:transparent;background:none;color:var(--fg2)}
    #ytp-root .btn.ghost:hover{background:var(--surface2);color:var(--fg)}
    #ytp-root .btn.danger{color:var(--err)}
    #ytp-root .btn.go{flex:1;min-width:0;border:0;color:#fff;padding:10px 16px;justify-content:flex-start;gap:12px;
      background:linear-gradient(135deg,var(--brand),var(--brand2));box-shadow:0 8px 20px -8px var(--brand)}
    #ytp-root .btn.go:hover{filter:brightness(1.06)}
    #ytp-root .btn.go:disabled{filter:grayscale(.7);box-shadow:none}
    #ytp-root .btn.go .gi{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,.2)}
    #ytp-root .btn.go .gt{display:flex;flex-direction:column;align-items:flex-start;min-width:0;line-height:1.25}
    #ytp-root .btn.go .gt b{font-size:13.5px}
    #ytp-root .btn.go .gt small{font-size:11px;font-weight:500;opacity:.85;max-width:100%;overflow:hidden;text-overflow:ellipsis}
    #ytp-root .btn.go.running .gi{animation:ytp-spin 1.2s linear infinite}

    /* ---------- Form ---------- */
    #ytp-root.dark input{color-scheme:dark}
    #ytp-root .sched{margin-top:12px;border:1px solid var(--line);border-radius:var(--radius);background:var(--bg);overflow:hidden}
    #ytp-root .sched.on{border-color:color-mix(in srgb,var(--brand) 45%,var(--line))}
    #ytp-root .sched .sh{display:flex;align-items:center;gap:10px;padding:10px 12px}
    #ytp-root .sched .sh .si{display:grid;place-items:center;width:30px;height:30px;border-radius:9px;color:var(--brand);flex:0 0 auto;
      background:color-mix(in srgb,var(--brand) 12%,var(--bg))}
    #ytp-root .sched .sh .stx{flex:1;min-width:0}
    #ytp-root .sched .sh b{display:block;font-size:13px}
    #ytp-root .sched .sh small{display:block;font-size:11.5px;color:var(--fg3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #ytp-root .sched .sh .sw{padding:0;flex:0 0 auto}
    #ytp-root .sched .sb{padding:0 12px 12px;display:grid;gap:10px}
    #ytp-root .sched .g3{display:grid;grid-template-columns:1fr 70px 96px;gap:8px;align-items:end}
    #ytp-root .sched .g3 .mini,#ytp-root .when .mini{font-size:11px;font-weight:600;color:var(--fg3);margin-bottom:4px}
    #ytp-root .when{display:flex;align-items:center;gap:8px}
    #ytp-root .when input{flex:1}
    #ytp-root .when.bad input{border-color:var(--err);color:var(--err)}
    #ytp-root .when .wl{display:flex;align-items:center;gap:5px;font-size:11px;font-weight:600;color:var(--brand);white-space:nowrap}
    #ytp-root .when.bad .wl{color:var(--err)}
    #ytp-root input[type=datetime-local]{width:100%;background:var(--bg);color:var(--fg);border:1px solid var(--line2);border-radius:10px;
      padding:8px 11px;font-size:13px;font-family:inherit}
    #ytp-root input[type=datetime-local]:focus{outline:0;border-color:var(--focus);box-shadow:0 0 0 3px color-mix(in srgb,var(--focus) 22%,transparent)}
    #ytp-root input[type=text],#ytp-root input[type=number],#ytp-root select,#ytp-root textarea{width:100%;
      background:var(--bg);color:var(--fg);border:1px solid var(--line2);border-radius:10px;padding:9px 11px;font-size:13px;font-family:inherit;
      transition:border-color .15s,box-shadow .15s}
    #ytp-root select{appearance:none;cursor:pointer;padding-right:30px;
      background-image:linear-gradient(45deg,transparent 50%,var(--fg3) 50%),linear-gradient(135deg,var(--fg3) 50%,transparent 50%);
      background-position:calc(100% - 15px) 52%,calc(100% - 10px) 52%;background-size:5px 5px;background-repeat:no-repeat}
    #ytp-root textarea{min-height:150px;resize:vertical;line-height:1.55}
    #ytp-root input:focus,#ytp-root select:focus,#ytp-root textarea:focus{outline:0;border-color:var(--focus);
      box-shadow:0 0 0 3px color-mix(in srgb,var(--focus) 22%,transparent)}
    #ytp-root input:disabled,#ytp-root select:disabled{opacity:.6;background:var(--surface)}
    #ytp-root .lbl{display:flex;justify-content:space-between;align-items:baseline;gap:8px;color:var(--fg2);font-size:12px;font-weight:600;margin:14px 0 6px}
    #ytp-root .lbl:first-child{margin-top:0}
    #ytp-root .lbl span+span{font-weight:400;color:var(--fg3);font-size:11px;text-align:right}
    #ytp-root .row{display:flex;gap:8px;align-items:center}
    #ytp-root .field{position:relative}
    #ytp-root .field .cnt{position:absolute;right:10px;top:50%;transform:translateY(-50%);pointer-events:none}
    #ytp-root .field input{padding-right:58px}
    #ytp-root .cnt{font-size:11px;color:var(--fg3);font-variant-numeric:tabular-nums}
    #ytp-root .cnt.over{color:var(--err);font-weight:700}

    /* ---------- Section ---------- */
    #ytp-root .sec{border:1px solid var(--line);border-radius:var(--radius);padding:14px;margin-top:12px;background:var(--bg)}
    #ytp-root .sec:first-child{margin-top:0}
    #ytp-root .sec>h4{display:flex;align-items:center;gap:8px;margin:0 0 12px;font-size:11px;font-weight:700;letter-spacing:.08em;
      text-transform:uppercase;color:var(--fg3)}

    /* ---------- Drop zone ---------- */
    #ytp-root .drop{display:flex;align-items:center;gap:14px;border:1.5px dashed var(--line2);border-radius:var(--radius);padding:16px;
      cursor:pointer;transition:.18s;background:var(--surface)}
    #ytp-root .drop .di{display:grid;place-items:center;width:46px;height:46px;border-radius:12px;flex:0 0 auto;color:var(--brand);
      background:color-mix(in srgb,var(--brand) 12%,var(--bg))}
    #ytp-root .drop b{display:block;font-size:14px}
    #ytp-root .drop span{font-size:12px;color:var(--fg2)}
    #ytp-root .drop .kbd{display:inline-block;margin:4px 4px 0 0;padding:1px 7px;border-radius:6px;border:1px solid var(--line2);
      background:var(--bg);font-size:11px;color:var(--fg2)}
    #ytp-root .drop:hover,#ytp-root .drop.hover{border-color:var(--brand);background:color-mix(in srgb,var(--brand) 6%,var(--bg))}

    /* ---------- Stats ---------- */
    #ytp-root .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px}
    #ytp-root .stat{border:1px solid var(--line);border-radius:12px;padding:8px 10px;background:var(--bg)}
    #ytp-root .stat b{display:block;font-size:18px;font-weight:700;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
    #ytp-root .stat span{font-size:11px;color:var(--fg3)}
    #ytp-root .stat.ok b{color:var(--ok)} #ytp-root .stat.err b{color:var(--err)} #ytp-root .stat.info b{color:var(--info)}
    #ytp-root .bar{display:flex;align-items:center;gap:10px;margin-top:12px}
    #ytp-root .progress{flex:1;height:6px;background:var(--surface2);border-radius:99px;overflow:hidden}
    #ytp-root .progress i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--brand),var(--brand2));transition:width .4s}
    #ytp-root .bar .cnt{min-width:34px;text-align:right}

    #ytp-root .toolbar{display:flex;gap:8px;align-items:center;margin-top:12px}
    #ytp-root .toolbar select{flex:1}

    /* ---------- Queue cards ---------- */
    #ytp-root .card{position:relative;border:1px solid var(--line);border-radius:var(--radius);padding:12px;margin-top:10px;background:var(--bg);
      transition:border-color .15s,box-shadow .15s}
    #ytp-root .card::before{content:"";position:absolute;left:-1px;top:12px;bottom:12px;width:3px;border-radius:0 3px 3px 0;background:var(--sc,transparent)}
    #ytp-root .card:hover{border-color:var(--line2)}
    #ytp-root .card.uploading,#ytp-root .card.review{border-color:color-mix(in srgb,var(--sc) 55%,var(--line));
      box-shadow:0 0 0 3px color-mix(in srgb,var(--sc) 14%,transparent)}
    #ytp-root .card.done{opacity:.78}
    #ytp-root .card.drag{border-color:var(--focus);border-style:dashed;background:color-mix(in srgb,var(--focus) 6%,var(--bg))}
    #ytp-root .card .top{display:flex;gap:12px;align-items:flex-start}
    #ytp-root .card .th{position:relative;width:104px;aspect-ratio:16/9;border-radius:9px;overflow:hidden;flex:0 0 auto;
      background:linear-gradient(135deg,var(--surface2),var(--surface));display:flex;align-items:center;justify-content:center;color:var(--fg3);border:1px solid var(--line)}
    #ytp-root .card .th img{position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover;display:block}
    #ytp-root .card .th .sz{position:absolute;right:4px;bottom:4px;padding:1px 5px;border-radius:5px;background:rgba(0,0,0,.72);color:#fff;font-size:10px;font-weight:600}
    #ytp-root .card .info{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}
    #ytp-root .card .fnrow{display:flex;align-items:center;gap:6px}
    #ytp-root .card .fn{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600;font-size:13px}
    #ytp-root .card .info select{padding:6px 28px 6px 9px;font-size:12px;border-radius:8px}
    #ytp-root .card .fields{display:grid;gap:8px;margin-top:10px}
    #ytp-root .card .fields .mini{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:600;color:var(--fg3);margin-bottom:4px}
    #ytp-root .card .msg{display:flex;gap:6px;align-items:flex-start;font-size:12px;margin-top:10px;padding:8px 10px;border-radius:9px;
      background:var(--surface);color:var(--fg2);word-break:break-word}
    #ytp-root .card.error .msg{background:color-mix(in srgb,var(--err) 9%,var(--bg));color:var(--err)}
    #ytp-root .card.done .msg{background:color-mix(in srgb,var(--ok) 9%,var(--bg));color:var(--ok)}
    #ytp-root .card.review .msg{background:color-mix(in srgb,var(--warn) 10%,var(--bg));color:var(--warn)}

    #ytp-root .pill{display:inline-flex;align-items:center;gap:6px;align-self:flex-start;font-size:11px;font-weight:600;border-radius:999px;
      padding:2px 9px 2px 7px;white-space:nowrap;color:var(--sc);background:color-mix(in srgb,var(--sc) 12%,transparent)}
    #ytp-root .pill::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}
    #ytp-root .card.uploading .pill::before{animation:ytp-pulse 1s ease-in-out infinite}
    #ytp-root .card.pending{--sc:var(--muted)} #ytp-root .card.uploading{--sc:var(--info)} #ytp-root .card.review{--sc:var(--warn)}
    #ytp-root .card.done{--sc:var(--ok)} #ytp-root .card.error{--sc:var(--err)}

    #ytp-root .att{display:flex;flex-wrap:wrap;gap:6px}
    #ytp-root .att .chip{display:inline-flex;align-items:center;gap:6px;max-width:100%;cursor:default;padding:3px 6px 3px 8px;font-size:11.5px}
    #ytp-root .att .chip span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #ytp-root .att .chip.add{cursor:pointer;border-style:dashed;background:none;color:var(--fg2);padding-right:10px}
    #ytp-root .att .chip.add:hover{color:var(--fg);border-color:var(--fg3)}
    #ytp-root .att .chip .rm{display:grid;place-items:center;width:16px;height:16px;border-radius:50%;cursor:pointer;color:var(--fg3)}
    #ytp-root .att .chip .rm:hover{background:var(--surface2);color:var(--err)}
    #ytp-root .att .chip.bad{color:var(--err);border-color:color-mix(in srgb,var(--err) 40%,transparent)}

    #ytp-root .empty{display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;color:var(--fg3);padding:34px 0 20px}
    #ytp-root .empty .ei{display:grid;place-items:center;width:52px;height:52px;border-radius:16px;background:var(--surface);border:1px solid var(--line)}
    #ytp-root .empty b{color:var(--fg2);font-size:13px}

    /* ---------- Chips / segmented ---------- */
    #ytp-root .chips{display:flex;flex-wrap:wrap;gap:6px}
    #ytp-root .chip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line2);background:var(--surface);color:var(--fg);
      border-radius:999px;padding:5px 11px;font-size:12px;cursor:pointer;transition:.15s}
    #ytp-root .chip:hover{border-color:var(--fg3)}
    #ytp-root .chip.var{font-family:"JetBrains Mono",Consolas,monospace;font-size:11px;padding:3px 9px;color:var(--fg2)}
    #ytp-root .chip.var:hover{color:var(--focus);border-color:var(--focus)}
    #ytp-root .seg{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;padding:4px;border-radius:12px;background:var(--surface);border:1px solid var(--line)}
    #ytp-root .seg button{background:none;color:var(--fg2);border:0;padding:8px 4px;border-radius:9px;font-size:12px;font-weight:600;cursor:pointer}
    #ytp-root .seg button.on{background:var(--bg);color:var(--fg);box-shadow:0 1px 3px rgba(0,0,0,.12),0 0 0 1px var(--line)}

    /* ---------- Presets list ---------- */
    #ytp-root .plist{display:flex;flex-direction:column;gap:6px}
    #ytp-root .pitem{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:11px;border:1px solid var(--line);cursor:pointer;
      background:var(--bg);transition:.15s}
    #ytp-root .pitem:hover{border-color:var(--line2);background:var(--surface)}
    #ytp-root .pitem.on{border-color:var(--focus);box-shadow:0 0 0 3px color-mix(in srgb,var(--focus) 16%,transparent)}
    #ytp-root .pitem .k{display:grid;place-items:center;width:24px;height:24px;border-radius:7px;background:var(--surface2);color:var(--fg2);
      font-size:11px;font-weight:700;flex:0 0 auto}
    #ytp-root .pitem .pl{flex:1;min-width:0}
    #ytp-root .pitem .pl b{display:block;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #ytp-root .pitem .pl span{display:block;font-size:11px;color:var(--fg3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #ytp-root .pitem .main{display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:700;color:var(--warn);
      background:color-mix(in srgb,var(--warn) 12%,transparent);padding:2px 7px;border-radius:999px}

    /* ---------- YouTube-style preview ---------- */
    #ytp-root .yt{display:flex;gap:12px;padding:12px;border-radius:12px;background:var(--surface);border:1px solid var(--line)}
    #ytp-root .yt .vt{position:relative;width:140px;aspect-ratio:16/9;border-radius:9px;flex:0 0 auto;overflow:hidden;
      background:radial-gradient(120% 120% at 20% 10%,#3b1d2a,#120c14 60%,#07070a);display:grid;place-items:center;color:rgba(255,255,255,.75)}
    #ytp-root .yt .vt .sz{position:absolute;right:5px;bottom:5px;padding:1px 5px;border-radius:4px;background:rgba(0,0,0,.8);color:#fff;font-size:10px;font-weight:600}
    #ytp-root .yt .vtx{flex:1;min-width:0}
    #ytp-root .yt .vtl{font-size:13.5px;font-weight:600;line-height:1.35;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}
    #ytp-root .yt .vch{font-size:12px;color:var(--fg3);margin-top:4px}
    #ytp-root .tagline{display:flex;flex-wrap:wrap;gap:4px;margin-top:10px}
    #ytp-root .tagline span{font-size:11px;padding:2px 8px;border-radius:999px;background:var(--surface2);color:var(--fg2)}

    /* ---------- Switches ---------- */
    #ytp-root .sw{display:flex;align-items:flex-start;gap:12px;padding:11px 0;cursor:pointer}
    #ytp-root .sw+.sw{border-top:1px solid var(--line)}
    #ytp-root .sw input{display:none}
    #ytp-root .sw .t{flex:0 0 38px;height:22px;border-radius:999px;background:var(--line2);position:relative;transition:.18s;margin-top:1px}
    #ytp-root .sw .t::after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;
      box-shadow:0 1px 3px rgba(0,0,0,.3);transition:.18s}
    #ytp-root .sw input:checked+.t{background:linear-gradient(135deg,var(--brand),var(--brand2))}
    #ytp-root .sw input:checked+.t::after{left:19px}
    #ytp-root .sw b{display:block;font-weight:600;font-size:13px}
    #ytp-root .sw small{display:block;color:var(--fg3);font-size:12px;margin-top:2px}
    #ytp-root .kv{display:grid;grid-template-columns:1fr 120px;gap:10px;align-items:center;padding:8px 0}
    #ytp-root .kv+.kv{border-top:1px solid var(--line)}
    #ytp-root .kv b{display:block;font-weight:600}
    #ytp-root .kv small{display:block;color:var(--fg3);font-size:12px}
    #ytp-root .hint{display:flex;gap:8px;color:var(--fg2);font-size:12px;line-height:1.6}
    #ytp-root .hint .ic{margin-top:3px;color:var(--fg3)}
    #ytp-root kbd{font-family:inherit;font-size:11px;padding:1px 6px;border-radius:5px;border:1px solid var(--line2);border-bottom-width:2px;background:var(--surface)}

    /* ---------- Toast ---------- */
    #ytp-root .toast{position:fixed;left:50%;bottom:24px;transform:translate(-50%,16px);opacity:0;z-index:100002;display:flex;gap:10px;align-items:center;
      background:#111116;color:#f2f2f6;padding:11px 16px;border-radius:12px;border:1px solid #2a2a33;
      box-shadow:0 16px 40px -10px rgba(0,0,0,.6);transition:.22s cubic-bezier(.2,.8,.2,1);max-width:min(560px,90vw);pointer-events:none;font-size:13px}
    #ytp-root .toast .ti{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;flex:0 0 auto;
      background:linear-gradient(135deg,var(--brand),var(--brand2));color:#fff}
    #ytp-root .toast.show{opacity:1;transform:translate(-50%,0)}

    /* ---------- Claims tab ---------- */
    #ytp-root .tbx-card{border-radius:12px;background:var(--surface);border:1px solid var(--line);border-left:4px solid var(--muted);padding:10px 12px}
    #ytp-root .tbx-card.busy{border-left-color:var(--info)} #ytp-root .tbx-card.ok{border-left-color:var(--ok)}
    #ytp-root .tbx-card.wait{border-left-color:var(--warn)} #ytp-root .tbx-card.err{border-left-color:var(--err)}
    #ytp-root .tbx-card .ti{display:flex;gap:8px;align-items:center;font-weight:700;font-size:13px}
    #ytp-root .tbx-card .de{color:var(--fg2);margin-top:3px;font-size:12px;word-break:break-word}
    #ytp-root .tbx-bar{height:6px;background:var(--surface2);border-radius:99px;margin-top:8px;overflow:hidden}
    #ytp-root .tbx-bar i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--brand),var(--brand2));transition:width .4s}
    #ytp-root .tbx-bar.ind i{width:35%!important;animation:ytp-ind 1.2s infinite ease-in-out}
    #ytp-root .tbx-steps{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px}
    #ytp-root .tbx-steps span{font-size:10.5px;padding:2px 8px;border-radius:999px;background:var(--surface2);color:var(--fg3)}
    #ytp-root .tbx-steps span.done{color:var(--ok);background:color-mix(in srgb,var(--ok) 12%,transparent)}
    #ytp-root .tbx-steps span.now{color:var(--info);background:color-mix(in srgb,var(--info) 14%,transparent);font-weight:700}
    #ytp-root .tbx-sd{color:var(--info);margin-top:6px;font-size:12px}
    #ytp-root .tbx-grid3,#ytp-root .tbx-grid2,#ytp-root .tbx-grid1{display:grid;gap:8px;margin-top:10px}
    #ytp-root .tbx-grid3{grid-template-columns:1.2fr 1fr auto} #ytp-root .tbx-grid2{grid-template-columns:1fr 1fr} #ytp-root .tbx-grid1{grid-template-columns:1fr}
    #ytp-root .tbx-grid3 .btn,#ytp-root .tbx-grid2 .btn{padding:9px 10px;font-size:12.5px}
    #ytp-root #tbx-log{max-height:220px;overflow:auto;margin-top:8px;background:var(--surface);border:1px solid var(--line);border-radius:10px;
      padding:8px;font:11.5px/1.55 "JetBrains Mono",Consolas,monospace;color:var(--fg2)}
    #ytp-root #tbx-log div{word-break:break-word}
    #ytp-root .tbx-ok{color:var(--ok)} #ytp-root .tbx-warn{color:var(--warn)} #ytp-root .tbx-err{color:var(--err)}
    #ytp-root .tbx-note{margin-top:10px;padding:10px 12px;border-radius:10px;background:var(--surface);border:1px solid var(--line);font-size:12px;line-height:1.55}
    #ytp-root .tbx-note.tbx-err{background:color-mix(in srgb,var(--err) 9%,var(--bg));border-color:color-mix(in srgb,var(--err) 40%,var(--line));margin:0 0 12px}
    #ytp-root .mut{color:var(--fg3);font-size:12px}
    #ytp-root #tbx-modal{position:fixed;inset:0;z-index:100003;background:rgba(5,5,10,.55);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center}
    #ytp-root #tbx-modal .box{background:var(--bg);color:var(--fg);width:min(580px,95vw);max-height:88vh;overflow:auto;border-radius:18px;padding:20px;
      border:1px solid var(--line);box-shadow:var(--shadow)}
    #ytp-root #tbx-modal h3{margin:0 0 8px;font-size:17px;font-weight:700;letter-spacing:-.01em}
    #ytp-root #tbx-modal textarea{min-height:140px;font:12px/1.55 "JetBrains Mono",Consolas,monospace}
    #ytp-root .tbx-sec{margin-top:16px;padding-top:10px;border-top:1px solid var(--line);font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--brand)}
    #ytp-root .tbx-cb{display:flex;gap:10px;align-items:flex-start;margin:10px 0;cursor:pointer;font-size:13px}
    #ytp-root .tbx-cb input{margin-top:3px;accent-color:var(--brand)}
    #ytp-root .tbx-scroll{max-height:55vh;overflow:auto;border:1px solid var(--line);border-radius:12px}
    #ytp-root .tbx-table{width:100%;border-collapse:collapse;font-size:12px}
    #ytp-root .tbx-table th{position:sticky;top:0;background:var(--surface);text-align:left;color:var(--fg2);font-weight:600;padding:8px;border-bottom:1px solid var(--line);z-index:1}
    #ytp-root .tbx-table td{padding:8px;border-bottom:1px solid var(--line);vertical-align:top}
    #ytp-root .tbx-table tr.own{background:color-mix(in srgb,var(--warn) 7%,transparent)}
    #ytp-root .tbx-table a{color:var(--info);text-decoration:none;font-weight:600}
    #ytp-root .tbx-table input[type=checkbox]{accent-color:var(--brand)}
    #ytp-root .chip.bad{color:var(--err);border-color:color-mix(in srgb,var(--err) 40%,transparent);background:color-mix(in srgb,var(--err) 8%,var(--bg))}
    @keyframes ytp-ind{0%{margin-left:-35%}100%{margin-left:100%}}
    @keyframes ytp-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.7)}}
    @keyframes ytp-spin{to{transform:rotate(360deg)}}
  `);

  const root = h('div', { id: 'ytp-root' });
  let Claims = null; // โมดูลลิขสิทธิ์ (สร้างด้านล่าง)
  const toastMsg = h('span');
  const toastEl = h('div', { className: 'toast' }, h('span', { className: 'ti' }, icon('check', 13)), toastMsg);
  let toastTimer;
  function toast(msg) {
    toastMsg.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3800);
  }

  // ----- โครงหลัก -----
  const fabLabel = h('span', { className: 'fpr' });
  const fabChan = h('span', { className: 'fch' });
  const fabBadge = h('span', { className: 'badge', hidden: true });
  const fab = h('button', { className: 'fab', onclick: () => (drawer.classList.contains('open') ? closeDrawer() : openDrawer()) },
    h('span', { className: 'logo' }, icon('play', 15)),
    h('span', { className: 'fcol' }, fabChan, fabLabel),
    fabBadge
  );

  const tabs = {};
  const tabCount = {};
  const panes = {};
  const footers = {};
  let currentTab = 'queue';
  const nav = h('div', { className: 'tabs' });
  const body = h('div', { className: 'body' });
  const footWrap = h('div');
  for (const [key, label, ic] of [['queue', 'อัปโหลด', 'queue'], ['presets', 'พรีเซ็ต', 'layers'], ['claims', 'ลิขสิทธิ์', 'shield'], ['settings', 'ตั้งค่า', 'sliders']]) {
    tabCount[key] = h('span', { className: 'n' });
    tabs[key] = h('button', { onclick: () => showTab(key) }, icon(ic, 15), label, tabCount[key]);
    nav.append(tabs[key]);
  }

  // แถบแสดงช่องที่กำลังใช้งาน + ปุ่มล็อกช่อง
  const chanAv = h('div', { className: 'av' });
  const chanName = h('div', { className: 'nm' });
  const chanSub = h('div', { className: 'id mono' });
  const lockIcon = h('span');
  const lockTxt = h('span');
  const lockBtn = h('button', {
    className: 'lk',
    onclick: () => {
      if (settings.lockChannel) {
        settings.lockChannel = null;
        toast('ปลดล็อกช่องแล้ว');
      } else {
        const c = getChannel();
        if (!c.id) return toast('ตรวจไม่พบรหัสช่อง ลองเข้าหน้า Dashboard หรือ Content ก่อน');
        settings.lockChannel = { id: c.id, name: chanLabel(c) };
        toast(`ล็อกไว้ที่ช่อง "${chanLabel(c)}" แล้ว ถ้าสลับไปช่องอื่นจะอัปไม่ได้`);
      }
      saveSettings();
      updateChannelUI();
    },
  }, lockIcon, lockTxt);
  const chanBar = h('div', { className: 'chan' },
    chanAv,
    h('div', { className: 'ct' }, h('div', { className: 'cap' }, 'กำลังอัปไปที่ช่อง'), chanName, chanSub),
    lockBtn
  );

  const drawer = h('div', { className: 'drawer' },
    h('div', { className: 'hd' },
      h('span', { className: 'logo' }, icon('upload', 18)),
      h('div', { className: 'tt' }, h('b', {}, 'Upload Studio'), h('span', {}, 'อัปโหลดหลายคลิป · พรีเซ็ตชื่อ/คำอธิบาย')),
      iconBtn('x', 'ปิด (Alt+P)', () => closeDrawer())
    ),
    chanBar, nav, body, footWrap
  );

  let lastChanKey = '';
  function updateChannelUI() {
    const c = getChannel();
    const problem = channelProblem();
    const lock = settings.lockChannel;
    const key = JSON.stringify([c, problem, lock]);
    if (key === lastChanKey) return;
    lastChanKey = key;
    chanAv.replaceChildren(c.avatar ? h('img', { src: c.avatar, alt: '' }) : h('div', { className: 'ph' }, icon('tv', 18)));
    chanName.textContent = chanLabel(c);
    chanSub.textContent = problem || c.id || '—';
    chanBar.classList.toggle('bad', !!problem);
    chanBar.classList.toggle('locked', !!lock && !problem);
    lockIcon.replaceChildren(icon(lock ? 'lock' : 'unlock', 14));
    lockTxt.textContent = lock ? 'ล็อกแล้ว' : 'ล็อกช่อง';
    lockBtn.title = lock ? `ล็อกไว้ที่ "${lock.name}" · คลิกเพื่อปลดล็อก` : 'ล็อกให้อัปได้เฉพาะช่องนี้';
    fabChan.textContent = (problem ? '⚠ ' : lock ? '🔒 ' : '') + chanLabel(c);
    fab.classList.toggle('bad', !!problem);
    fab.title = problem ? problem : `ช่องปัจจุบัน: ${chanLabel(c)}`;
    updateRunUI();
  }
  setInterval(updateChannelUI, 1500);

  function showTab(key) {
    currentTab = key;
    for (const k in tabs) tabs[k].classList.toggle('on', k === key);
    body.replaceChildren(panes[key]);
    body.scrollTop = 0;
    footWrap.replaceChildren(...(footers[key] ? [footers[key]] : []));
    if (key === 'presets') renderPresetEditor();
    if (key === 'claims' && Claims) Claims.renderStatus();
  }
  function openDrawer(tab) {
    root.classList.toggle('dark', document.documentElement.hasAttribute('dark'));
    if (tab) showTab(tab);
    updateChannelUI();
    drawer.classList.add('open');
  }
  function closeDrawer() {
    drawer.classList.remove('open');
  }

  // ----- แท็บคิว -----
  const fileInput = h('input', { type: 'file', multiple: true, accept: 'video/*,.txt,image/*', hidden: true, onchange: (e) => { addFiles(e.target.files); e.target.value = ''; } });
  const dropZone = h('div', { className: 'drop', onclick: () => fileInput.click() },
    h('div', { className: 'di' }, icon('upload', 22)),
    h('div', {},
      h('b', {}, 'ลากไฟล์มาวาง หรือคลิกเพื่อเลือก'),
      h('span', {}, 'เลือกได้หลายไฟล์ จับคู่ด้วยชื่อไฟล์อัตโนมัติ'),
      h('div', {}, h('span', { className: 'kbd' }, '.mp4 คลิป'), h('span', { className: 'kbd' }, '.txt คำอธิบาย'), h('span', { className: 'kbd' }, '.jpg ภาพปก'))
    )
  );
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('hover'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('hover'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('hover');
    addFiles(e.dataTransfer.files);
  });

  const defaultPresetSel = h('select', {
    title: 'พรีเซ็ตสำหรับคลิปที่เพิ่มใหม่',
    onchange: (e) => { activeId = e.target.value; save('activeId', activeId); refreshLabels(); },
  });
  const applyAllBtn = h('button', {
    className: 'btn sm', title: 'เปลี่ยนพรีเซ็ตของทุกคลิปที่ยังไม่ได้อัป',
    onclick: () => {
      queue.forEach((it) => { if (it.status === 'pending' || it.status === 'error') { it.presetId = activeId; it.titleEdited = false; } });
      renderQueue();
    },
  }, icon('layers', 14), 'ใช้กับทุกคลิป');
  const listEl = h('div');
  const progress = h('i', { style: 'width:0' });
  const progressPct = h('span', { className: 'cnt' });
  const progressWrap = h('div', { className: 'bar', hidden: true }, h('div', { className: 'progress' }, progress), progressPct);
  const stat = (cls, label) => {
    const b = h('b', {}, '0');
    return { el: h('div', { className: 'stat ' + cls }, b, h('span', {}, label)), b };
  };
  const stats = { total: stat('', 'ทั้งหมด'), pending: stat('info', 'รอคิว'), done: stat('ok', 'เสร็จแล้ว'), error: stat('err', 'ผิดพลาด') };
  const statsWrap = h('div', { className: 'stats', hidden: true }, Object.values(stats).map((s) => s.el));

  // ----- แผงตั้งเวลาปล่อย -----
  const sch = settings.schedule;
  const tomorrow19 = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(19, 0, 0, 0);
    return toLocalInput(d.getTime());
  };
  const schedSummary = h('small');
  const schedStart = h('input', {
    type: 'datetime-local', value: sch.start || '',
    onchange: (e) => { sch.start = e.target.value; saveSettings(); onScheduleChange(); },
  });
  const schedEvery = h('input', {
    type: 'number', min: 1, max: 999, value: sch.every || 1,
    oninput: (e) => { sch.every = Math.max(1, parseInt(e.target.value, 10) || 1); saveSettings(); onScheduleChange(); },
  });
  const schedUnit = h('select', {
    onchange: (e) => { sch.unit = e.target.value; saveSettings(); onScheduleChange(); },
  }, h('option', { value: 'day', selected: sch.unit !== 'hour' }, 'วัน'), h('option', { value: 'hour', selected: sch.unit === 'hour' }, 'ชั่วโมง'));
  const quick = (label, fn) => h('button', { className: 'chip', onclick: () => { schedStart.value = sch.start = fn(); saveSettings(); onScheduleChange(); } }, label);
  const atToday = (hh) => () => {
    const d = new Date();
    d.setHours(hh, 0, 0, 0);
    if (d.getTime() < Date.now() + SCHEDULE_MIN_LEAD) d.setDate(d.getDate() + 1);
    return toLocalInput(d.getTime());
  };
  const schedBody = h('div', { className: 'sb' },
    h('div', { className: 'g3' },
      h('div', {}, h('div', { className: 'mini' }, 'คลิปแรกปล่อย'), schedStart),
      h('div', {}, h('div', { className: 'mini' }, 'ทุก ๆ'), schedEvery),
      h('div', {}, h('div', { className: 'mini' }, '\u00a0'), schedUnit)
    ),
    h('div', { className: 'chips' },
      quick('พรุ่งนี้ 19:00', tomorrow19),
      quick('18:00 ถัดไป', atToday(18)),
      quick('20:00 ถัดไป', atToday(20)),
      quick('ภายใน 1 ชม.', () => toLocalInput(Math.ceil((Date.now() + 3600e3) / 900e3) * 900e3))
    ),
    h('div', { className: 'hint' }, icon('alert', 13),
      h('span', {}, 'คลิปจะอัปเป็นส่วนตัว แล้วเปลี่ยนเป็นสาธารณะเองตามเวลาที่ตั้ง · แก้เวลาของแต่ละคลิปได้ในการ์ด'))
  );
  const schedToggle = h('input', {
    type: 'checkbox', checked: !!sch.on,
    onchange: (e) => {
      sch.on = e.target.checked;
      if (sch.on && !sch.start) schedStart.value = sch.start = tomorrow19();
      saveSettings();
      onScheduleChange();
    },
  });
  const schedPanel = h('div', { className: 'sched' },
    h('div', { className: 'sh' },
      h('span', { className: 'si' }, icon('clock', 16)),
      h('div', { className: 'stx' }, h('b', {}, 'ตั้งเวลาปล่อยคลิป'), schedSummary),
      h('label', { className: 'sw' }, schedToggle, h('span', { className: 't' }))
    ),
    schedBody
  );

  // เรียกหลังอัปคลิปที่ตั้งเวลาเสร็จ (เวลาเริ่มถูกเลื่อนไปช่องถัดไป)
  function syncScheduleInput() {
    if (document.activeElement !== schedStart) schedStart.value = sch.start || '';
    onScheduleChange();
  }

  function onScheduleChange() {
    const on = scheduleOn();
    schedPanel.classList.toggle('on', !!sch.on);
    schedBody.hidden = !sch.on;
    const items = queue.filter((i) => i.status !== 'done');
    if (!sch.on) schedSummary.textContent = 'ปิดอยู่ · คลิปจะเผยแพร่ตามการเปิดเผยของพรีเซ็ต';
    else if (!on) schedSummary.textContent = 'เลือกเวลาปล่อยคลิปแรก';
    else {
      const unit = sch.unit === 'hour' ? 'ชั่วโมง' : 'วัน';
      const times = items.map(itemPublishAt).filter(Boolean).sort((a, b) => a - b);
      schedSummary.textContent = times.length > 1
        ? `${fmtWhen(times[0])} → ${fmtWhen(times[times.length - 1])} · ทุก ${sch.every} ${unit}`
        : `เริ่ม ${fmtWhen(new Date(sch.start).getTime())} · ทุก ${sch.every} ${unit}`;
    }
    queue.forEach(updateItemUI);
    updateRunUI();
  }

  panes.queue = h('div', {},
    fileInput, dropZone,
    h('div', { className: 'toolbar' }, defaultPresetSel, applyAllBtn),
    schedPanel,
    statsWrap,
    progressWrap,
    listEl
  );

  const startTxt = h('b');
  const startSub = h('small');
  const startBtn = h('button', { className: 'btn go', onclick: runQueue },
    h('span', { className: 'gi' }, icon('play', 14)), h('span', { className: 'gt' }, startTxt, startSub));
  const stopBtn = iconBtn('stop', 'หยุดหลังคลิปปัจจุบันเสร็จ', () => { stopReq = true; toast('จะหยุดหลังคลิปปัจจุบันเสร็จ'); }, 'outline danger');
  const clearBtn = iconBtn('clear', 'ล้างคลิปที่อัปเสร็จออกจากรายการ', () => {
    for (let i = queue.length - 1; i >= 0; i--) if (queue[i].status === 'done') queue.splice(i, 1);
    renderQueue();
  }, 'outline');
  footers.queue = h('div', { className: 'ft' }, startBtn, stopBtn, clearBtn);

  const fmtSize = (b) => (b > 1e9 ? (b / 1e9).toFixed(2) + ' GB' : (b / 1e6).toFixed(1) + ' MB');

  function presetOptions(selected) {
    return presets.map((p, i) => h('option', { value: p.id, selected: p.id === selected }, `${i + 1}. ${p.label}`));
  }

  function buildCard(it) {
    const pill = h('span', { className: 'pill' });
    const cnt = h('span', { className: 'cnt' });
    const msgTxt = h('span');
    const msgIcon = h('span');
    const msg = h('div', { className: 'msg' }, msgIcon, msgTxt);
    const thumbBox = h('div', { className: 'th' }, icon('film', 22), h('span', { className: 'sz' }, fmtSize(it.file.size)));
    const titleIn = h('input', {
      type: 'text', placeholder: 'ชื่อคลิป',
      oninput: (e) => { it.title = e.target.value; it.titleEdited = true; updateItemUI(it); },
    });
    const resetBtn = iconBtn('refresh', 'สร้างชื่อจากพรีเซ็ตใหม่', () => { it.titleEdited = false; assignNumbers(); updateItemUI(it); }, 'outline');
    // แก้รายชื่อศิลปินของคลิปนี้ ({artists}) ลบให้ว่าง = กลับไปใช้ค่าอัตโนมัติจาก .txt
    const artistsIn = h('input', {
      type: 'text', placeholder: 'คั่นด้วย , (อัตโนมัติจาก .txt)',
      oninput: (e) => { it.artists = e.target.value; it.artistsEdited = !!e.target.value.trim(); assignNumbers(); updateItemUI(it); },
    });
    // เวลาปล่อยของคลิปนี้ (แก้เองได้ ลบ/รีเซ็ต = กลับไปใช้เวลาที่คำนวณจากคิว)
    const whenIn = h('input', {
      type: 'datetime-local',
      onchange: (e) => {
        const ms = new Date(e.target.value).getTime();
        it.publishEdited = !!ms;
        it.publishAt = ms || null;
        onScheduleChange();
      },
    });
    const whenLbl = h('span', { className: 'wl' });
    const whenReset = iconBtn('refresh', 'ใช้เวลาตามคิว', () => { it.publishEdited = false; it.publishAt = null; onScheduleChange(); }, 'outline');
    const whenBox = h('div', {}, h('div', { className: 'mini' }, 'เวลาปล่อย'), h('div', { className: 'when' }, whenIn, whenLbl, whenReset));
    const artistsMode = h('span', { style: 'font-weight:400' });
    const artistsBox = h('div', {}, h('div', { className: 'mini' }, 'ศิลปิน', artistsMode), artistsIn);
    const presetSel = h('select', {
      onchange: (e) => { it.presetId = e.target.value; it.titleEdited = false; renderQueue(); },
    }, presetOptions(it.presetId));
    const retryBtn = h('button', { className: 'btn sm', onclick: () => {
      if (it.draftId && !confirm(`คลิปนี้อัปขึ้นไปเป็นฉบับร่างแล้ว (${it.draftId})\nถ้าลองใหม่จะได้คลิปซ้ำ — ลบฉบับร่างใน Content แล้วหรือยัง?\n\nกด OK เพื่ออัปใหม่`)) return;
      it.draftId = '';
      setItem(it, 'pending'); assignNumbers(); renderQueue();
    } }, icon('refresh', 13), 'ลองใหม่');
    const removeBtn = iconBtn('x', 'เอาออกจากคิว', () => { queue.splice(queue.indexOf(it), 1); renderQueue(); }, 'danger');
    const att = h('div', { className: 'att' });
    const attachInput = h('input', {
      type: 'file', multiple: true, accept: '.txt,image/*', hidden: true,
      onchange: async (e) => { await attachToItem(it, e.target.files); e.target.value = ''; },
    });
    const el = h('div', { className: 'card' },
      h('div', { className: 'top' },
        thumbBox,
        h('div', { className: 'info' },
          h('div', { className: 'fnrow' }, h('span', { className: 'fn', title: it.file.name }, it.file.name), removeBtn),
          h('div', { className: 'row' }, pill, retryBtn),
          presetSel
        )
      ),
      h('div', { className: 'fields' },
        h('div', {},
          h('div', { className: 'mini' }, 'ชื่อคลิป'),
          h('div', { className: 'row' }, h('div', { className: 'field', style: 'flex:1' }, titleIn, cnt), resetBtn)
        ),
        whenBox,
        artistsBox,
        att
      ),
      msg,
      attachInput
    );
    // ลาก .txt / ภาพ มาวางบนการ์ดเพื่อแนบกับคลิปนี้โดยตรง
    el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drag'); });
    el.addEventListener('dragleave', () => el.classList.remove('drag'));
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.classList.remove('drag');
      attachToItem(it, e.dataTransfer.files);
    });
    it.ui = { el, pill, cnt, msg, msgTxt, msgIcon, thumbBox, titleIn, resetBtn, artistsIn, artistsBox, artistsMode, presetSel, retryBtn, removeBtn, att, attachInput, whenBox, whenIn, whenLbl, whenReset };
    return el;
  }

  const MSG_ICON = { pending: 'alert', uploading: 'upload', review: 'alert', done: 'check', error: 'alert' };

  function updateItemUI(it) {
    const u = it.ui;
    if (!u) return;
    const [label] = STATUS[it.status];
    const editable = it.status === 'pending' || it.status === 'error';
    u.el.className = 'card ' + it.status;
    u.pill.className = 'pill';
    u.pill.textContent = label;
    if (document.activeElement !== u.titleIn) u.titleIn.value = it.title;
    u.titleIn.disabled = u.presetSel.disabled = u.artistsIn.disabled = !editable;
    const p = presetById(it.presetId);
    u.artistsBox.hidden = !`${p.title} ${p.description} ${(p.tags || []).join(' ')}`.includes('{artists}');
    if (document.activeElement !== u.artistsIn) u.artistsIn.value = it.artistsEdited ? it.artists : itemVars(it).artists;
    u.artistsMode.textContent = it.artistsEdited ? '· พิมพ์เอง (ลบให้ว่าง = อัตโนมัติ)' : '· อัตโนมัติจาก .txt';
    u.resetBtn.hidden = !editable || !it.titleEdited;
    const at = itemPublishAt(it);
    u.whenBox.hidden = !at;
    if (at) {
      if (document.activeElement !== u.whenIn) u.whenIn.value = toLocalInput(at);
      u.whenIn.disabled = !editable;
      const bad = editable && scheduleProblem(at);
      u.whenBox.querySelector('.when').classList.toggle('bad', !!bad);
      u.whenLbl.replaceChildren(icon(bad ? 'alert' : 'clock', 12), bad ? 'อดีต/เร็วไป' : it.publishEdited ? 'ตั้งเอง' : 'ตามคิว');
      u.whenLbl.title = bad || '';
      u.whenReset.hidden = !editable || !it.publishEdited;
    }
    u.retryBtn.hidden = it.status !== 'error';
    u.removeBtn.hidden = it.status === 'uploading' || it.status === 'review';
    u.cnt.textContent = `${it.title.length}/${TITLE_MAX}`;
    u.cnt.className = 'cnt' + (it.title.length > TITLE_MAX ? ' over' : '');
    u.msgTxt.textContent = it.msg;
    u.msgIcon.replaceChildren(icon(MSG_ICON[it.status], 14));
    u.msg.hidden = !it.msg;
    renderAttachments(it, editable);
  }

  async function attachToItem(it, fileList) {
    if (!(it.status === 'pending' || it.status === 'error')) return;
    for (const f of fileList) {
      if (isTxt(f)) await attachTxt(it, f);
      else if (isImg(f)) attachThumb(it, f);
    }
    it.titleEdited = false;
    assignNumbers();
    updateItemUI(it);
  }

  function renderAttachments(it, editable) {
    const u = it.ui;
    if (u.thumbUrl && u.thumbFile !== it.thumb) { URL.revokeObjectURL(u.thumbUrl); u.thumbUrl = null; }
    if (it.thumb && !u.thumbUrl) { u.thumbUrl = URL.createObjectURL(it.thumb); u.thumbFile = it.thumb; }
    const oldImg = u.thumbBox.querySelector('img');
    if (u.thumbUrl && (!oldImg || oldImg.src !== u.thumbUrl)) {
      oldImg?.remove();
      u.thumbBox.prepend(h('img', { src: u.thumbUrl, alt: '' }));
    } else if (!u.thumbUrl && oldImg) oldImg.remove();

    const rm = (fn) => editable && h('span', { className: 'rm', title: 'เอาออก', onclick: fn }, icon('x', 11));
    const kids = [];
    if (it.txt) {
      const lines = it.txt.trim().split(/\r?\n/).length;
      kids.push(h('span', { className: 'chip', title: it.txt.slice(0, 600) }, icon('file', 13), h('span', {}, `${it.txtName} · ${lines} บรรทัด`),
        rm(() => { it.txt = ''; it.txtName = ''; it.titleEdited = false; assignNumbers(); updateItemUI(it); })));
    }
    if (it.thumb) {
      const big = it.thumb.size > THUMB_MAX;
      kids.push(h('span', { className: 'chip' + (big ? ' bad' : ''), title: it.thumb.name }, icon('image', 13),
        h('span', {}, big ? 'ภาพปกเกิน 2MB' : `ภาพปก · ${fmtSize(it.thumb.size)}`),
        rm(() => { it.thumb = null; updateItemUI(it); })));
    }
    const hits = it.txt && Claims ? Claims.claimedSongsIn(it.txt) : [];
    if (hits.length) {
      kids.push(h('span', {
        className: 'chip bad',
        title: 'เพลงใน tracklist ที่เคยโดน claim:\n' + hits.map((x) => `• ${x.line}  (เคยโดน ${x.times} คลิป)`).join('\n'),
      }, icon('alert', 13), h('span', {}, `${hits.length} เพลงเคยโดน claim`)));
    }
    if (editable && (!it.txt || !it.thumb)) {
      kids.push(h('button', { className: 'chip add', onclick: () => u.attachInput.click() }, icon('clip', 13), 'แนบ .txt / ภาพปก'));
    }
    u.att.replaceChildren(...kids);
    u.att.hidden = !kids.length;
  }

  function renderQueue() {
    assignNumbers();
    if (!queue.length) {
      listEl.replaceChildren(h('div', { className: 'empty' },
        h('div', { className: 'ei' }, icon('film', 24)),
        h('b', {}, 'ยังไม่มีคลิปในคิว'),
        h('span', {}, 'ลากโฟลเดอร์คลิปทั้งชุดมาวางด้านบนได้เลย')));
    } else {
      listEl.replaceChildren(...queue.map(buildCard));
      queue.forEach(updateItemUI);
    }
    onScheduleChange();
  }

  function updateRunUI() {
    const count = (s) => queue.filter((i) => i.status === s).length;
    const pending = count('pending');
    const done = count('done');
    const errors = count('error');
    const total = queue.length;
    const blocked = !!channelProblem();
    const ch = chanLabel(getChannel());
    startBtn.disabled = running || !pending || blocked;
    startBtn.classList.toggle('running', running);
    const sched = scheduleOn() ? ' · ตั้งเวลา' : '';
    startTxt.textContent = running ? `กำลังอัปโหลด ${done + 1}/${total}` : blocked ? 'ช่องไม่ตรงกับที่ล็อกไว้' : pending ? `เริ่มอัปโหลด ${pending} คลิป${sched}` : 'เริ่มอัปโหลด';
    startSub.textContent = blocked ? 'ปลดล็อกหรือสลับกลับไปช่องที่ล็อกไว้' : `ไปที่ช่อง ${ch}`;
    stopBtn.disabled = !running;
    clearBtn.disabled = !done;
    applyAllBtn.disabled = running;
    statsWrap.hidden = !total;
    stats.total.b.textContent = total;
    stats.pending.b.textContent = pending;
    stats.done.b.textContent = done;
    stats.error.b.textContent = errors;
    progressWrap.hidden = !total || (!running && !done);
    const pct = total ? Math.round((done / total) * 100) : 0;
    progress.style.width = pct + '%';
    progressPct.textContent = pct + '%';
    fabBadge.hidden = !total;
    fabBadge.textContent = running ? `${done}/${total}` : String(pending || total);
    tabCount.queue.textContent = total ? String(total) : '';
  }

  // ----- แท็บพรีเซ็ต -----
  let editId = activeId;
  let lastField = null;
  const presetList = h('div', { className: 'plist' });
  const fLabel = h('input', { type: 'text' });
  const fTitle = h('input', { type: 'text' });
  const fDesc = h('textarea');
  const fTags = h('input', { type: 'text', placeholder: 'คั่นด้วยเครื่องหมายจุลภาค ,' });
  const fEp = h('input', { type: 'number', min: 1 });
  const titleCnt = h('span', { className: 'cnt' });
  const visSeg = h('div', { className: 'seg' });
  const fArtists = h('input', { type: 'text', placeholder: 'เช่น SZA, Chris Brown, Nessy J., BLXD' });
  const fArtistMax = h('input', { type: 'number', min: 1, max: 10 });
  const sampleIn = h('input', { type: 'text', value: 'nessy_j_mix.mp4' });
  // tracklist ตัวอย่างสำหรับดูพรีวิว (ลากไฟล์ .txt จริงมาวางที่ช่องทดลองเพื่อเปลี่ยนได้)
  let sampleTxt = [
    '00:00 BLXD - Late Night Calls',
    '02:50 Nessy J. - Toxic Craving',
    '05:10 BLXD x Chris Brown - When I Call Your Name',
    '08:30 SZA - Snooze (Cover by BLXD)',
    '11:20 BLXD - Waiting On Me (ft. Brent Faiyaz)',
  ].join('\n');
  const sampleTxtLbl = h('span', {}, 'tracklist ตัวอย่าง');
  const pvTitle = h('div', { className: 'vtl' });
  const pvChan = h('div', { className: 'vch' });
  const pvTags = h('div', { className: 'tagline' });
  const varChips = h('div', { className: 'chips' },
    VARS.map((v) => h('button', {
      className: 'chip var', title: 'แทรกลงช่องที่กำลังแก้',
      onmousedown: (e) => e.preventDefault(),
      onclick: () => insertVar(`{${v}}`),
    }, `{${v}}`))
  );

  [fTitle, fDesc, fTags].forEach((f) => f.addEventListener('focus', () => (lastField = f)));

  // ลากไฟล์ .txt มาวางในช่องคำอธิบาย = แทรกเนื้อหาไฟล์ตรงตำแหน่งเคอร์เซอร์
  fDesc.addEventListener('dragover', (e) => e.preventDefault());
  fDesc.addEventListener('drop', async (e) => {
    const f = [...(e.dataTransfer?.files || [])].find(isTxt);
    if (!f) return;
    e.preventDefault();
    e.stopPropagation();
    lastField = fDesc;
    insertVar((await readText(f)).replace(/\r\n/g, '\n').trim());
    toast(`แทรกเนื้อหาจาก ${f.name} แล้ว`);
  });

  function insertVar(text) {
    const f = lastField || fTitle;
    f.focus();
    f.setRangeText(text, f.selectionStart, f.selectionEnd, 'end');
    f.dispatchEvent(new Event('input', { bubbles: true }));
  }

  const editing = () => presetById(editId);
  function bind(field, el, toVal = (v) => v) {
    el.addEventListener('input', () => {
      editing()[field] = toVal(el.value);
      save('presets', presets);
      if (field === 'label') renderPresetList();
      renderPresetPreview();
      refreshLabels();
    });
  }
  bind('label', fLabel);
  bind('title', fTitle);
  bind('description', fDesc);
  bind('tags', fTags, (v) => v.split(',').map((s) => s.trim()).filter(Boolean));
  bind('artistPriority', fArtists, (v) => v.split(',').map((s) => s.trim()).filter(Boolean));
  bind('artistMax', fArtistMax, (v) => Math.max(1, parseInt(v, 10) || 4));
  sampleIn.addEventListener('input', renderPresetPreview);
  sampleIn.addEventListener('dragover', (e) => e.preventDefault());
  sampleIn.addEventListener('drop', async (e) => {
    const files = [...(e.dataTransfer?.files || [])];
    const txt = files.find(isTxt);
    const vid = files.find(isVideo);
    if (!txt && !vid) return;
    e.preventDefault();
    e.stopPropagation();
    if (txt) {
      sampleTxt = await readText(txt);
      sampleTxtLbl.textContent = txt.name;
    }
    sampleIn.value = (vid || txt).name.replace(TXT_EXT, '.mp4');
    renderPresetPreview();
  });
  fEp.addEventListener('change', () => {
    counters[editId] = Math.max(1, parseInt(fEp.value, 10) || 1) - 1;
    save('counters', counters);
    renderPresetPreview();
    renderQueue();
  });

  function renderPresetList() {
    presetList.replaceChildren(
      ...presets.map((p, i) => h('div', {
        className: 'pitem' + (p.id === editId ? ' on' : ''), title: `Alt+${i + 1} = ตั้งเป็นพรีเซ็ตหลัก`,
        onclick: () => { editId = p.id; renderPresetEditor(); },
      },
        h('span', { className: 'k' }, String(i + 1)),
        h('div', { className: 'pl' }, h('b', {}, p.label || '(ไม่มีชื่อ)'), h('span', {}, p.title || '')),
        p.id === activeId && h('span', { className: 'main' }, icon('star', 10), 'หลัก')
      ))
    );
  }

  function renderPresetEditor() {
    if (!presets.some((p) => p.id === editId)) editId = activeId;
    const p = editing();
    renderPresetList();
    fLabel.value = p.label || '';
    fTitle.value = p.title || '';
    fDesc.value = p.description || '';
    fTags.value = (p.tags || []).join(', ');
    fArtists.value = (p.artistPriority || []).join(', ');
    fArtistMax.value = p.artistMax || 4;
    visSeg.replaceChildren(
      ...Object.entries(VIS).map(([k, label]) => h('button', {
        className: (p.visibility || 'PRIVATE') === k ? 'on' : '',
        onclick: () => { p.visibility = k; save('presets', presets); renderPresetEditor(); },
      }, label))
    );
    renderPresetPreview();
  }

  function renderPresetPreview() {
    const p = editing();
    const n = (counters[p.id] || 0) + 1;
    if (document.activeElement !== fEp) fEp.value = n;
    const vars = buildVars(sampleIn.value, n, sampleTxt, { preset: p });
    const t = makeTitle(p, vars);
    pvTitle.textContent = t || '—';
    pvChan.textContent = `${chanLabel(getChannel())} · ${VIS[p.visibility || 'PRIVATE']}`;
    titleCnt.textContent = `${t.length}/${TITLE_MAX}`;
    titleCnt.className = 'cnt' + (t.length > TITLE_MAX ? ' over' : '');
    pvTags.replaceChildren(...renderTags(p, vars).map((t) => h('span', {}, t)));
  }

  const sec = (title, ic, ...kids) => h('div', { className: 'sec' }, h('h4', {}, icon(ic, 13), title), ...kids);

  panes.presets = h('div', {},
    sec('พรีเซ็ตทั้งหมด', 'layers',
      presetList,
      h('div', { className: 'row', style: 'margin-top:10px;flex-wrap:wrap' },
        h('button', { className: 'btn sm', onclick: () => {
          const p = { id: 'p' + Date.now().toString(36), label: '✨ พรีเซ็ตใหม่', title: '{name}', description: '', tags: [], visibility: 'PRIVATE' };
          presets.push(p); save('presets', presets); editId = p.id; renderPresetEditor(); refreshLabels(); fLabel.focus(); fLabel.select();
        } }, icon('plus', 13), 'ใหม่'),
        h('button', { className: 'btn sm', onclick: () => {
          const p = { ...structuredClone(editing()), id: 'p' + Date.now().toString(36) };
          p.label += ' (สำเนา)';
          presets.push(p); save('presets', presets); editId = p.id; renderPresetEditor(); refreshLabels();
        } }, icon('copy', 13), 'ทำสำเนา'),
        h('button', { className: 'btn sm', onclick: () => { activeId = editId; save('activeId', activeId); refreshLabels(); renderPresetList(); toast(`ตั้ง "${editing().label}" เป็นพรีเซ็ตหลักแล้ว`); } }, icon('star', 13), 'ตั้งเป็นหลัก'),
        h('span', { style: 'flex:1' }),
        h('button', { className: 'btn sm ghost danger', onclick: () => {
          if (presets.length < 2) return toast('ต้องมีพรีเซ็ตอย่างน้อย 1 อัน');
          if (!confirm(`ลบพรีเซ็ต "${editing().label}"?`)) return;
          presets = presets.filter((p) => p.id !== editId);
          save('presets', presets);
          if (!presets.some((p) => p.id === activeId)) { activeId = presets[0].id; save('activeId', activeId); }
          queue.forEach((it) => { if (!presets.some((p) => p.id === it.presetId)) it.presetId = activeId; });
          editId = activeId; renderPresetEditor(); refreshLabels(); renderQueue();
        } }, icon('clear', 13), 'ลบ')
      )
    ),
    sec('ตัวอย่างบน YouTube', 'tv',
      h('div', { className: 'yt' },
        h('div', { className: 'vt' }, icon('play', 26), h('span', { className: 'sz' }, '2:53:12')),
        h('div', { className: 'vtx' }, pvTitle, pvChan)
      ),
      pvTags,
      h('div', { className: 'lbl' }, h('span', {}, 'ทดลองกับไฟล์'), sampleTxtLbl),
      sampleIn,
      h('div', { className: 'hint', style: 'margin-top:6px' }, icon('clip', 13), 'ลาก .mp4 หรือ .txt จริงมาวางที่ช่องนี้เพื่อดูผลลัพธ์')
    ),
    sec('ข้อมูลคลิป', 'film',
      h('div', { className: 'lbl' }, 'ชื่อพรีเซ็ต'), fLabel,
      h('div', { className: 'lbl' }, h('span', {}, 'ชื่อคลิป'), titleCnt), fTitle,
      h('div', { className: 'lbl' }, h('span', {}, 'คำอธิบาย'), h('span', {}, 'ลาก .txt มาวางเพื่อแทรกข้อความ')), fDesc,
      h('div', { className: 'lbl' }, 'แท็ก'), fTags,
      h('div', { className: 'lbl' }, h('span', {}, 'ตัวแปร'), h('span', {}, 'คลิกเพื่อแทรกในช่องที่กำลังแก้')), varChips,
      h('div', { className: 'hint', style: 'margin-top:10px' }, icon('alert', 13),
        h('span', {}, 'ครอบด้วย [[ ... ]] เพื่อให้ส่วนนั้นหายไปเมื่อตัวแปรข้างในว่าง เช่น [[ | {bpm} BPM]]'))
    ),
    sec('ศิลปิน', 'queue',
      h('div', { className: 'lbl' }, h('span', {}, 'ให้ขึ้นก่อนใน {artists}'), h('span', {}, 'เฉพาะคนที่อยู่ใน tracklist')), fArtists,
      h('div', { className: 'kv', style: 'margin-top:8px' },
        h('div', {}, h('b', {}, 'จำนวนสูงสุดในชื่อคลิป'), h('small', {}, 'ถ้าชื่อยาวเกิน 100 ตัวอักษรจะลดให้อัตโนมัติ')), fArtistMax)
    ),
    sec('การเผยแพร่', 'send',
      visSeg,
      h('div', { className: 'kv', style: 'margin-top:8px' },
        h('div', {}, h('b', {}, 'EP ถัดไป'), h('small', {}, 'ค่าของ {n} สำหรับคลิปถัดไป')), fEp)
    )
  );
  footers.presets = h('div', { className: 'ft' },
    h('button', { className: 'btn', style: 'flex:1', onclick: applyToOpenDialog, title: 'ใส่พรีเซ็ตหลักลงหน้าต่างอัปโหลดที่เปิดอยู่' }, icon('send', 14), 'ใส่ลงหน้าต่างที่เปิดอยู่'),
    h('button', { className: 'btn ghost danger', onclick: () => {
      if (!confirm('คืนค่าพรีเซ็ตทั้งหมดเป็นค่าเริ่มต้น? พรีเซ็ตที่แก้ไว้จะหายไป')) return;
      presets = structuredClone(DEFAULT_PRESETS); save('presets', presets);
      activeId = editId = presets[0].id; save('activeId', activeId);
      queue.forEach((it) => { if (!presets.some((p) => p.id === it.presetId)) it.presetId = activeId; });
      renderPresetEditor(); refreshLabels(); renderQueue();
    } }, icon('refresh', 14), 'คืนค่าเริ่มต้น')
  );

  // ----- แท็บตั้งค่า -----
  function sw(key, title, desc, onChange) {
    return h('label', { className: 'sw' },
      h('input', { type: 'checkbox', checked: !!settings[key], onchange: (e) => { settings[key] = e.target.checked; saveSettings(); onChange && onChange(); } }),
      h('span', { className: 't' }),
      h('span', {}, h('b', {}, title), h('small', {}, desc))
    );
  }
  panes.settings = h('div', {},
    sec('อัปโหลดแบบคิว', 'queue',
      sw('autoSave', 'กด Save ให้อัตโนมัติ', 'ตั้งการเปิดเผยตามพรีเซ็ตแล้วกด Save ต่อไฟล์ถัดไปเลย ถ้าปิดไว้จะรอให้คุณตรวจแล้วกด Save เองทีละคลิป'),
      sw('thumb', 'อัปภาพปกให้อัตโนมัติ', 'ใช้ไฟล์ .jpg/.png ชื่อเดียวกับคลิป (ไม่เกิน 2MB และช่องต้องยืนยันตัวตนแล้ว)'),
      sw('intercept', 'รับหลายไฟล์จากหน้าต่างของ YouTube', 'เลือกหรือลากหลายไฟล์ในหน้าต่างอัปโหลดปกติของ Studio จะส่งมาเข้าคิวนี้แทน')
    ),
    sec('ความปลอดภัย', 'lock',
      sw('confirmStart', 'ถามยืนยันชื่อช่องก่อนเริ่มคิว', 'แสดงชื่อช่องปัจจุบันให้ยืนยันทุกครั้งที่กดเริ่ม'),
      h('div', { className: 'hint', style: 'margin-top:6px' }, icon('lock', 13),
        h('span', {}, 'กดปุ่ม "ล็อกช่อง" ด้านบนเพื่อให้อัปได้เฉพาะช่องนั้น ถ้าสลับช่อง คิวจะหยุดเอง'))
    ),
    sec('อัปโหลดทีละไฟล์ (หน้าต่างปกติของ YouTube)', 'upload',
      sw('autoApply', 'เติมข้อมูลอัตโนมัติ', 'ใส่ชื่อ/คำอธิบาย/แท็กจากพรีเซ็ตหลักให้ทันทีเมื่อเลือกไฟล์'),
      sw('autoNext', 'กด Next ไปหน้าการเปิดเผย', 'เลือกการเปิดเผยตามพรีเซ็ตให้ แต่ไม่กด Save')
    ),
    sec('ตรวจปัญหา', 'alert',
      h('div', { className: 'hint' }, icon('alert', 13),
        h('span', {}, 'เปิดหน้าต่างอัปโหลดค้างไว้ที่หน้ากรอกรายละเอียด (มีส่วน Thumbnail) แล้วกดปุ่มนี้ ข้อมูลโครงสร้างหน้าจะถูกคัดลอก ส่งไปให้ผู้พัฒนาแก้สคริปต์ได้ (อ่านอย่างเดียว ไม่กดอะไรในหน้า)')),
      h('button', { className: 'btn sm', style: 'margin-top:10px', onclick: () => {
        const info = diagnoseUploadDialog();
        GM_setClipboard(JSON.stringify(info, null, 1));
        toast(info.error ? info.error : 'คัดลอกข้อมูลตรวจปัญหาแล้ว — วางส่งให้ผู้พัฒนาได้เลย');
      } }, icon('copy', 13), 'คัดลอกข้อมูลหน้าต่างอัปโหลด')
    ),
    sec('ทั่วไป', 'sliders',
      h('div', { className: 'kv' },
        h('div', {}, h('b', {}, 'หมวดหมู่'), h('small', {}, 'ข้อความตามที่ Studio แสดง เช่น Music หรือ เพลง · เว้นว่าง = ไม่ตั้ง')),
        h('input', { type: 'text', value: settings.category, oninput: (e) => { settings.category = e.target.value.trim(); saveSettings(); } })
      ),
      h('div', { className: 'kv' },
        h('div', {}, h('b', {}, 'Paid promotion'), h('small', {}, 'คลิปมีการโปรโมตแบบชำระเงินไหม')),
        h('select', { onchange: (e) => { settings.paidPromotion = e.target.value; saveSettings(); } },
          [['no', 'ไม่มี'], ['yes', 'มี'], ['skip', 'ไม่ตอบ']].map(([v, l]) => h('option', { value: v, selected: settings.paidPromotion === v }, l)))
      ),
      h('div', { className: 'kv' },
        h('div', {}, h('b', {}, 'ขั้น Monetisation'), h('small', {}, 'เปิด/ปิดโฆษณาให้คลิปใหม่')),
        h('select', { onchange: (e) => { settings.monetization = e.target.value; saveSettings(); } },
          [['on', 'เปิดโฆษณา (On)'], ['off', 'ปิดโฆษณา (Off)'], ['skip', 'ทำเอง']].map(([v, l]) => h('option', { value: v, selected: settings.monetization === v }, l)))
      ),
      h('div', { className: 'kv' },
        h('div', {}, h('b', {}, 'ขั้น Ad suitability'), h('small', {}, 'ติ๊ก "None of the above" = ยืนยันว่าคลิปไม่มีเนื้อหาในหมวดเหล่านั้น แล้วกด Submit rating (ส่งแล้วแก้ไม่ได้)')),
        h('select', { onchange: (e) => { settings.adSuitability = e.target.value; saveSettings(); } },
          [['none', 'None of the above'], ['skip', 'ทำเอง']].map(([v, l]) => h('option', { value: v, selected: settings.adSuitability === v }, l)))
      ),
      h('div', { className: 'kv' },
        h('div', {}, h('b', {}, 'AI use (เนื้อหาดัดแปลง/สังเคราะห์)'), h('small', {}, 'คำถาม "Was AI used to generate or edit your content…"')),
        h('select', { onchange: (e) => { settings.alteredContent = e.target.value; saveSettings(); } },
          [['skip', 'ไม่ตอบ'], ['no', 'ไม่ใช่'], ['yes', 'ใช่']].map(([v, l]) => h('option', { value: v, selected: settings.alteredContent === v }, l)))
      ),
      h('div', { className: 'kv' },
        h('div', {}, h('b', {}, 'ปีที่ใช้ใน {year}'), h('small', {}, 'เว้นว่าง = ปีปัจจุบันอัตโนมัติ')),
        h('input', {
          type: 'number', min: 2000, max: 2100, placeholder: String(new Date().getFullYear()), value: settings.year,
          oninput: (e) => { settings.year = e.target.value.trim(); saveSettings(); refreshLabels(); },
        })
      ),
      h('div', { className: 'kv' },
        h('div', {}, h('b', {}, 'รอใส่ภาพปกนานสุด'), h('small', {}, 'นาที · ภาพปกใส่ได้หลังวิดีโออัปขึ้นไปแล้ว ไฟล์ใหญ่ตั้งเผื่อไว้')),
        h('input', { type: 'number', min: 1, max: 600, value: settings.thumbWaitMin, onchange: (e) => { settings.thumbWaitMin = Math.max(1, Number(e.target.value) || 120); saveSettings(); } })
      ),
      h('div', { className: 'kv' },
        h('div', {}, h('b', {}, 'จังหวะการทำงาน'), h('small', {}, 'หน้าเว็บโหลดช้า / เน็ตช้า ให้เลือก "ช้า" หรือ "ช้ามาก" สคริปต์จะพักและรอแต่ละขั้นนานขึ้น')),
        h('select', { onchange: (e) => { settings.pace = e.target.value; saveSettings(); toast(`จังหวะการทำงาน: ${e.target.selectedOptions[0].textContent}`); } },
          [['normal', 'ปกติ (x1)'], ['slow', 'ช้า (x1.6)'], ['slower', 'ช้ามาก (x2.5)']].map(([v, l]) => h('option', { value: v, selected: (settings.pace || 'normal') === v }, l)))
      ),
      h('div', { className: 'kv' },
        h('div', {}, h('b', {}, 'พักระหว่างไฟล์'), h('small', {}, 'หน่วยวินาที')),
        h('input', { type: 'number', min: 0, max: 120, value: settings.delay, onchange: (e) => { settings.delay = Math.max(0, Number(e.target.value) || 0); saveSettings(); } })
      )
    ),
    h('div', { className: 'sec' },
      h('div', { className: 'hint' }, icon('sliders', 13),
        h('span', {}, h('kbd', {}, 'Alt'), ' + ', h('kbd', {}, 'P'), ' เปิด/ปิดแผง · ', h('kbd', {}, 'Alt'), ' + ', h('kbd', {}, '1…9'), ' เลือกพรีเซ็ตหลัก')),
      h('div', { className: 'hint', style: 'margin-top:8px' }, icon('alert', 13),
        h('span', {}, 'ระหว่างที่คิวทำงาน อย่าปิดหรือรีเฟรชแท็บนี้ · YouTube จำกัดจำนวนอัปโหลดต่อวัน ถ้าชนลิมิตคิวจะหยุดเอง'))
    )
  );

  function refreshLabels() {
    const p = active();
    fabLabel.textContent = p.label;
    defaultPresetSel.replaceChildren(...presetOptions(activeId));
    queue.forEach((it) => it.ui && it.ui.presetSel.replaceChildren(...presetOptions(it.presetId)));
    if (currentTab === 'presets') {
      renderPresetList();
      renderPresetPreview();
    }
    assignNumbers();
    queue.forEach(updateItemUI);
  }

  // =====================================================================
  // ===== ลิขสิทธิ์ (ย้ายมาจาก YT Studio Helper THAIBEATS v2.2.1) =====
  // สแกน claim ผ่าน API ภายในของ Studio (อ่านอย่างเดียว) → ตัดด้วย "Trim out segment" ของ YouTube
  // ข้อมูลเก็บแยกตามช่อง (key:channelId) เพื่อไม่ให้รายการของแต่ละช่องปนกัน
  // =====================================================================
  Claims = (() => {
    const DEFAULTS = {
      autoSaveTrim: true, // ตอนสคริปต์ตัดเอง: กด Save → ติ๊ก "I acknowledge" → Confirm changes
      autoSaveManualTrim: false, // ตอนเปิดหน้าตัดเองด้วยมือ: ให้สคริปต์กด Save ให้ (ปิดไว้ จะได้ปรับเวลาก่อนได้)
      followUpMinutes: '10',
      ownNames: 'THAIBEATS, EXMGE',
      apEveryHours: '6',
      apSkipOwn: true,
      apOnlyImpact: true,
      apMaxPct: '25',
      apMaxPerCycle: '10',
      apAdsOn: false,
    };
    const cfg = () => Object.assign({}, DEFAULTS, load('cfg', {}));
    const saveCfg = (c) => save('cfg', c);

    const visible = (el) => !!el && (el.offsetParent !== null ||
      (el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none'));
    const CLICKABLE = 'button, ytcp-button, tp-yt-paper-button, [role="button"], ytcp-button-shape button';
    const findText = (re, sel = CLICKABLE, rootEl = document) =>
      [...rootEl.querySelectorAll(sel)].filter((el) => visible(el) && re.test(el.innerText.trim()));
    const isDisabled = (el) =>
      el.disabled || el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true' ||
      !!el.closest('[disabled],[aria-disabled="true"]');

    // ข้อความปุ่มต่าง ๆ ด้านล่างเป็นภาษาอังกฤษ → ต้องตั้งภาษา Studio เป็น English
    const studioIsEnglish = () => /^en/i.test(document.documentElement.lang || 'en');

    // ห้ามเปลี่ยนหน้าระหว่างที่คิวอัปโหลดยังมีไฟล์ (ไฟล์อยู่ในหน่วยความจำของหน้า จะหายถ้าเปลี่ยนหน้า)
    const uploadBusy = () => running || queue.some((i) => ['pending', 'uploading', 'review', 'error'].includes(i.status));

    /* ---------- Studio internal API ---------- */
    const W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    const ycfg = (k) => W.ytcfg && W.ytcfg.get(k);
    function currentChannel() {
      const m = location.pathname.match(/\/channel\/(UC[\w-]{22})/);
      return ycfg('CHANNEL_ID') || (m && m[1]) || 'unknown';
    }
    const channelName = () => chanLabel(getChannel()) || currentChannel();
    const chGet = (name, def, ch = currentChannel()) => load(name + ':' + ch, def);
    const chSet = (name, val, ch = currentChannel()) => save(name + ':' + ch, val);

    async function authHeader() {
      const m = document.cookie.match(/(?:^|; )(?:SAPISID|__Secure-3PAPISID)=([^;]+)/);
      if (!m) throw new Error('ไม่ได้ล็อกอิน (ไม่พบคุกกี้ SAPISID)');
      const ts = Math.floor(Date.now() / 1000);
      const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(`${ts} ${m[1]} https://studio.youtube.com`));
      return `SAPISIDHASH ${ts}_${[...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
    }

    async function yti(path, body) {
      const ctx = JSON.parse(JSON.stringify(ycfg('INNERTUBE_CONTEXT')));
      const dc = ycfg('DELEGATION_CONTEXT');
      const pageId = ycfg('DELEGATED_SESSION_ID');
      ctx.user = Object.assign({}, ctx.user, dc ? { delegationContext: dc } : {}, pageId ? { onBehalfOfUser: pageId } : {});
      const headers = {
        'Content-Type': 'application/json',
        Authorization: await authHeader(),
        'X-Origin': 'https://studio.youtube.com',
        'X-Goog-AuthUser': String(ycfg('SESSION_INDEX') || 0),
        'X-Youtube-Client-Name': String(ycfg('INNERTUBE_CONTEXT_CLIENT_NAME')),
        'X-Youtube-Client-Version': ycfg('INNERTUBE_CONTEXT_CLIENT_VERSION'),
      };
      if (pageId) headers['X-Goog-PageId'] = pageId;
      const res = await W.fetch(`/youtubei/v1/${path}?alt=json`, {
        method: 'POST', credentials: 'include', headers, body: JSON.stringify(Object.assign({ context: ctx }, body)),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(`${path}: ${res.status} ${(j.error && j.error.message) || ''}`);
      return j;
    }

    const fmt = (sec) => {
      sec = Math.round(sec);
      const hh = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s2 = sec % 60;
      return (hh ? hh + ':' + String(m).padStart(2, '0') : m) + ':' + String(s2).padStart(2, '0');
    };
    const short = (e) => String(e || '').replace(/^.*?(IMPACT|STATUS|OPTION)_/, '').replace(/_/g, ' ').toLowerCase();

    // ข้อมูลเพลงจาก claim มีหลายรูปแบบ (soundRecording, composition, web, …) → ไล่หา title / artists / label
    function claimInfo(c) {
      const md = (c && c.asset && c.asset.metadata) || {};
      const found = { title: '', artists: [], label: '' };
      (function walk(o, d) {
        if (!o || typeof o !== 'object' || d > 5) return;
        for (const [k, v] of Object.entries(o)) {
          if (!found.title && /^(title|assetTitle)$/.test(k) && typeof v === 'string' && v.trim()) found.title = v.trim();
          else if (/^(artists|writers|performers)$/.test(k) && Array.isArray(v) && !found.artists.length) found.artists = v.map((x) => (typeof x === 'string' ? x : (x && (x.name || x.displayName)) || '')).filter(Boolean);
          else if (!found.label && /^(recordLabel|label|publisher)$/.test(k) && typeof v === 'string') found.label = v;
          else if (v && typeof v === 'object') walk(v, d + 1);
        }
      })(md, 0);
      return found;
    }

    /* ---------- สแกน claim (อ่านอย่างเดียว) ---------- */
    let scanning = false;
    let scanProg = null;
    async function listVideos(mask, label) {
      const CH = currentChannel();
      const vids = [];
      let tok, pages = 0;
      do {
        const body = {
          filter: { and: { operands: [{ channelIdIs: { value: CH } }, { videoOriginIs: { value: 'VIDEO_ORIGIN_UPLOAD' } }] } },
          order: 'VIDEO_ORDER_DISPLAY_TIME_DESC', pageSize: 50, mask,
        };
        if (tok) body.pageToken = tok;
        const j = await yti('creator/list_creator_videos', body);
        vids.push(...(j.videos || []));
        tok = j.nextPageToken;
        pages++;
        scanProg = { label: `${label} อ่านแล้ว ${vids.length} คลิป`, done: 0, total: 0 };
        renderStatus();
        await sleep(300);
      } while (tok && pages < 400);
      return vids;
    }

    async function scanClaims({ show = true } = {}) {
      if (scanning) return null;
      if (!ycfg('INNERTUBE_CONTEXT')) { log('Studio ยังโหลดไม่เสร็จ ลองใหม่ในอีกไม่กี่วินาที', 'warn'); return null; }
      scanning = true;
      scanProg = { label: 'กำลังอ่านรายการวิดีโอ…', done: 0, total: 0 };
      const CH = currentChannel();
      const chName = channelName();
      const own = cfg().ownNames.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
      try {
        log('สแกน: กำลังอ่านรายการวิดีโอ…');
        const vids = await listVideos({ videoId: true, title: true, privacy: true, lengthSeconds: true, copyrightSummary: { all: true }, allRestrictions: { all: true } }, 'กำลังอ่านรายการวิดีโอ…');
        const claimed = vids.filter((v) =>
          +((v.copyrightSummary || {}).activeThirdPartyClaimsCount || 0) > 0 ||
          ((v.allRestrictions || {}).restrictions || []).some((r) => r.reason === 'VIDEO_RESTRICTION_REASON_COPYRIGHT'));
        log(`สแกน: ${claimed.length} จาก ${vids.length} คลิปมี claim — กำลังอ่านรายละเอียด…`);

        const rows = [];
        for (let i = 0; i < claimed.length; i++) {
          const v = claimed[i];
          const impacts = (((v.allRestrictions || {}).summary || {}).impacts || []).map(short)
            .map((x) => x.replace(/^(monetization|visibility|video) /, '')).join(', ');
          let j;
          try {
            j = await yti('creator/list_creator_received_claims', { videoId: v.videoId, criticalRead: false, includeLicensingOptions: false, isCreatorMusicV2: true });
          } catch (e) { log(`${v.title}: ${e.message}`, 'err'); continue; }
          const owners = {};
          (j.contentOwners || []).forEach((o) => { owners[o.contentOwnerId] = o.displayName; });
          const up = uploadOf(v.videoId);

          for (const c of j.receivedClaims || []) {
            const rec = claimInfo(c);
            const claimant = (c.contentOwnerIds || []).map((id) => owners[id] || id).join(', ');
            const artists = rec.artists.join(', ');
            let segs = [];
            try {
              const m = await yti('copyright/get_creator_received_claim_matches', { videoId: v.videoId, channelId: CH, claimId: c.claimId });
              segs = (((m.matches || {}).claimMatches) || []).map((x) => x.videoSegment).filter(Boolean)
                .map((sg) => [(+sg.startMillis || 0) / 1000, (+sg.endMillis || 0) / 1000]);
            } catch (e) { log(`${v.title}: ช่วงเวลา — ${e.message}`, 'warn'); }
            if (!segs.length && c.matchDetails) {
              const st = +c.matchDetails.longestMatchStartTimeSeconds || 0;
              segs = [[st, st + (+c.matchDetails.longestMatchDurationSeconds || 0)]];
            }
            const opts = ((c.nontakedownClaimActions || {}).options || []).map(short);
            // แก้บัคเดิม: เดิมอ่าน rec.recordLabel ซึ่งไม่มีอยู่จริง ทำให้ label ว่างตลอด
            const hay = (artists + ' ' + claimant + ' ' + rec.label).toLowerCase();
            rows.push({
              videoId: v.videoId, video: v.title, privacy: short(v.privacy), length: +v.lengthSeconds || 0,
              claimId: c.claimId, song: rec.title || '(ไม่ทราบชื่อ)', artists, label: rec.label, claimant,
              type: short(c.type), status: short(c.status), impact: impacts, segments: segs,
              claimedSec: segs.reduce((a, sg) => a + (sg[1] - sg[0]), 0),
              canTrim: opts.includes('trim'), options: opts.join(', '),
              own: own.some((n) => hay.includes(n)), hasImpact: !!impacts,
              publishAt: up && up.publishAt ? up.publishAt : 0,
            });
            await sleep(250);
          }
          scanProg = { label: `อ่านรายละเอียด claim ${i + 1} / ${claimed.length}: ${v.title}`, done: i + 1, total: claimed.length };
          renderStatus();
          await sleep(300);
        }

        chSet('claimScan', { date: new Date().toISOString(), total: vids.length, rows, channel: CH, channelName: chName }, CH);
        recordSongs(rows, chName);
        log(`สแกนเสร็จ ✓ ${chName}: ${rows.length} claim ใน ${claimed.length} คลิป`, 'ok');
        flash('สแกนเสร็จแล้ว', `${rows.length} claim ใน ${claimed.length} จาก ${vids.length} คลิป`);
        if (show) showClaims();
        return rows;
      } catch (e) {
        log('สแกนไม่สำเร็จ: ' + e.message, 'err');
        return null;
      } finally {
        scanning = false;
        scanProg = null;
        renderStatus();
      }
    }

    function claimsCSV() {
      const scan = chGet('claimScan', null);
      if (!scan) return log('ยังไม่ได้สแกน', 'warn');
      const head = ['video', 'video_url', 'privacy', 'video_length', 'song', 'artists', 'label', 'claimant', 'own_music',
        'type', 'status', 'impact', 'claimed_segments', 'claimed_total', 'can_trim', 'options', 'claim_id'];
      const lines = scan.rows.map((r) => [r.video, `https://studio.youtube.com/video/${r.videoId}/claims`, r.privacy, fmt(r.length),
        r.song, r.artists, r.label, r.claimant, r.own ? 'yes' : 'no', r.type, r.status, r.impact,
        r.segments.map((sg) => fmt(sg[0]) + '-' + fmt(sg[1])).join(' ; '), fmt(r.claimedSec), r.canTrim ? 'yes' : 'no', r.options, r.claimId]);
      downloadCSV([head, ...lines], `youtube-claims-${scan.date.slice(0, 10)}.csv`);
    }

    /* ---------- modal ---------- */
    function openModal(...kids) {
      root.querySelector('#tbx-modal')?.remove();
      const box = h('div', { className: 'box' }, ...kids);
      const modal = h('div', { id: 'tbx-modal', onclick: (e) => { if (e.target === modal) modal.remove(); } }, box);
      root.append(modal);
      return { modal, box, close: () => modal.remove() };
    }
    const closeModal = () => root.querySelector('#tbx-modal')?.remove();

    function showClaims() {
      const scan = chGet('claimScan', null);
      if (!scan) return log(`ยังไม่ได้สแกนช่อง ${channelName()} — กด "สแกน claim" ก่อน`, 'warn');
      const picked = new Set(chGet('trimQueue', []));
      const results = chGet('trimResults', {});
      const rows = scan.rows;
      const videos = new Set(rows.map((r) => r.videoId)).size;
      const ownCount = rows.filter((r) => r.own).length;
      const cbs = [];

      const trimBtnM = h('button', { className: 'btn go sm', onclick: () => openTrimConfirm() });
      const refreshCount = () => {
        trimBtnM.textContent = `✂ ตัดที่เลือก (${picked.size})`;
        trimBtnM.disabled = !picked.size;
      };
      const setPicked = (key, on) => { on ? picked.add(key) : picked.delete(key); chSet('trimQueue', [...picked]); refreshCount(); };
      const stateBadge = (res) => res && h('div', { className: { saved: 'tbx-ok', gone: 'tbx-ok', failed: 'tbx-err', skipped: 'tbx-warn', later: 'tbx-warn' }[res.state] || '' },
        `${TRIM_LABEL[res.state] || res.state}${res.msg ? ' — ' + res.msg : ''}`);

      const seenVideo = new Set();
      const table = h('table', { className: 'tbx-table' },
        h('thead', {}, h('tr', {}, ['ตัด', 'วิดีโอ', 'เพลงที่โดน claim', 'ผู้ claim', 'ช่วงที่โดน', 'ผลกระทบ / ผล'].map((t) => h('th', {}, t)))),
        h('tbody', {}, rows.map((r) => {
          const key = r.videoId + ':' + r.claimId;
          const res = results[key];
          const doneAlready = res && (res.state === 'saved' || res.state === 'gone');
          if (doneAlready) picked.delete(key);
          const cb = h('input', {
            type: 'checkbox', checked: picked.has(key) && !doneAlready, disabled: !r.canTrim || doneAlready,
            title: doneAlready ? 'จัดการแล้ว' : r.canTrim ? 'เพิ่มในรายการตัด' : 'YouTube ไม่มีตัวเลือก Trim สำหรับ claim นี้',
            onchange: (e) => setPicked(key, e.target.checked),
          });
          cb._row = r; cb._key = key;
          cbs.push(cb);
          const pct = r.length ? Math.round((r.claimedSec / r.length) * 100) : 0;
          const firstOfVideo = !seenVideo.has(r.videoId);
          seenVideo.add(r.videoId);
          const soon = r.publishAt && r.publishAt > Date.now();
          return h('tr', { className: r.own ? 'own' : '' },
            h('td', {}, cb),
            h('td', {},
              h('a', { href: `/video/${r.videoId}/claims`, target: '_blank' }, r.video),
              h('div', { className: 'mut' }, `${r.privacy} · ${fmt(r.length)}`),
              soon && h('div', { className: 'tbx-warn' }, `⏰ ตั้งเวลาปล่อย ${fmtWhen(r.publishAt)}`),
              firstOfVideo && h('button', { className: 'btn sm', style: 'margin-top:4px', onclick: () => showTracklistFix(r.videoId) }, '📝 tracklist หลังตัด')),
            h('td', {}, r.song, h('div', { className: 'mut' }, [r.artists, r.label].filter(Boolean).join(' · '))),
            h('td', {}, r.claimant, r.own && h('div', { className: 'tbx-warn' }, '★ เพลงของคุณเอง')),
            h('td', {}, r.segments.map((sg) => fmt(sg[0]) + '–' + fmt(sg[1])).join(', ') || '?',
              h('div', { className: pct >= 50 ? 'tbx-err' : 'mut' }, `${fmt(r.claimedSec)} (${pct}% ของคลิป)`)),
            h('td', {}, r.impact || 'ไม่มีผลกระทบ', r.canTrim ? null : h('div', { className: 'mut' }, 'ไม่มีตัวเลือก Trim'), stateBadge(res)));
        })));
      chSet('trimQueue', [...picked]);
      const selectWhere = (fn) => { cbs.forEach((cb) => { if (!cb.disabled) { cb.checked = fn(cb._row); setPicked(cb._key, cb.checked); } }); };
      refreshCount();

      const m = openModal(
        h('h3', {}, `Claim ลิขสิทธิ์ — ${scan.channelName || channelName()}`),
        h('div', { className: 'mut', style: 'margin-bottom:10px' },
          `${rows.length} claim ใน ${videos} คลิป (จากทั้งหมด ${scan.total}) · สแกนเมื่อ ${new Date(scan.date).toLocaleString('th-TH')}` +
          (ownCount ? ` · ${ownCount} รายการดูเหมือนเป็นเพลงของคุณเอง (★) — ให้ค่ายเพลง/ดิสทริบิวเตอร์ allowlist ช่องแทนการตัด` : '')),
        h('div', { className: 'chips', style: 'margin-bottom:10px' },
          h('span', { className: 'mut' }, 'เลือก:'),
          h('button', { className: 'chip', onclick: () => selectWhere(() => true) }, 'ทุกอันที่ตัดได้'),
          h('button', { className: 'chip', onclick: () => selectWhere((r) => !r.own) }, 'ไม่ใช่เพลงของตัวเอง'),
          h('button', { className: 'chip', onclick: () => selectWhere((r) => r.hasImpact) }, 'กระทบวิดีโอ (รายได้/จำกัด/บล็อก)'),
          h('button', { className: 'chip', onclick: () => selectWhere((r) => r.hasImpact && r.publishAt > Date.now()) }, '⏰ ตั้งเวลาไว้ + กระทบ'),
          h('button', { className: 'chip', onclick: () => selectWhere((r) => r.length && r.claimedSec / r.length < 0.2) }, 'ช่วงที่โดน < 20%'),
          h('button', { className: 'chip', onclick: () => selectWhere(() => false) }, 'ไม่เลือก')),
        rows.length ? h('div', { className: 'tbx-scroll' }, table) : h('div', { className: 'tbx-ok' }, 'ไม่พบ claim 🎉'),
        h('div', { className: 'row', style: 'margin-top:14px' },
          h('span', { className: 'mut', style: 'flex:1' }, 'ติ๊กเลือกแค่สร้างรายการ ยังไม่มีอะไรเปลี่ยนบน YouTube จนกว่าจะกดเริ่มตัด'),
          h('button', { className: 'btn sm', onclick: claimsCSV }, '⬇ CSV'),
          h('button', { className: 'btn sm', onclick: () => { closeModal(); scanClaims(); } }, '↻ สแกนใหม่'),
          h('button', { className: 'btn sm', onclick: () => closeModal() }, 'ปิด'),
          trimBtnM));
      m.box.style.width = 'min(1100px,95vw)';
    }

    /* ---------- tracklist หลังตัด: ลบเพลงที่ถูกตัด + เลื่อน timestamp ---------- */
    const parseTime = (t) => t.split(':').map(Number).reduce((a, x) => a * 60 + x, 0);
    function fixTracklist(text, segments, videoLength) {
      const segs = [];
      for (const [a, b] of segments.map(([a, b]) => [Math.max(0, a), Math.max(a, b)]).sort((x, y) => x[0] - y[0])) {
        const last = segs[segs.length - 1];
        if (last && a <= last[1]) last[1] = Math.max(last[1], b);
        else segs.push([a, b]);
      }
      const removedBefore = (t) => segs.reduce((acc, [a, b]) => acc + Math.max(0, Math.min(t, b) - a), 0);
      const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
      const tracks = [];
      lines.forEach((line, idx) => {
        const m = line.match(/^\s*((?:\d{1,2}:)?\d{1,2}:\d{2})(\s*[-–|]?\s*)(.*)$/);
        if (m) tracks.push({ idx, start: parseTime(m[1]), sep: m[2], rest: m[3] });
      });
      tracks.forEach((t, i) => { t.end = i + 1 < tracks.length ? tracks[i + 1].start : (videoLength || t.start); });
      const total = Math.max(0, (videoLength || 0) - removedBefore(videoLength || 0));
      const longFmt = total >= 3600 || tracks.some((t) => t.start >= 3600);
      const tf = (sec) => {
        sec = Math.max(0, Math.round(sec));
        const hh = Math.floor(sec / 3600), mm = Math.floor((sec % 3600) / 60), ss = sec % 60;
        return longFmt ? `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
      };
      const removed = [];
      const out = lines.slice();
      let firstKept = true;
      for (const t of tracks) {
        const dur = Math.max(0, t.end - t.start);
        const cut = removedBefore(t.end) - removedBefore(t.start);
        if (dur > 0 ? cut / dur >= 0.5 : false) {
          removed.push(t.rest);
          out[t.idx] = null;
          continue;
        }
        let ns = t.start - removedBefore(t.start);
        if (firstKept) { ns = 0; firstKept = false; } // chapters ต้องเริ่มที่ 00:00
        out[t.idx] = tf(ns) + (t.sep || ' ') + t.rest;
      }
      return { text: out.filter((l) => l !== null).join('\n'), removed, kept: tracks.length - removed.length };
    }

    function showTracklistFix(videoId) {
      const scan = chGet('claimScan', null);
      if (!videoId) {
        // ยังไม่ได้เลือกคลิป: ให้เลือกจากคลิปที่สแกนเจอ claim
        const vids = [...new Map(((scan && scan.rows) || []).map((r) => [r.videoId, r])).values()];
        if (!vids.length) return toast('ยังไม่มีคลิปที่โดน claim — กด "สแกน claim" ก่อน');
        openModal(
          h('h3', {}, '📝 เลือกคลิปที่จะแก้ tracklist'),
          h('div', { className: 'plist', style: 'margin-top:10px' }, vids.map((r) => h('div', { className: 'pitem', onclick: () => showTracklistFix(r.videoId) },
            h('div', { className: 'pl' }, h('b', {}, r.video), h('span', {}, `${fmt(r.length)} · ${uploadOf(r.videoId) ? 'มี tracklist จากประวัติการอัป' : 'ต้องวาง tracklist เอง'}`))))),
          h('div', { className: 'row', style: 'margin-top:14px;justify-content:flex-end' }, h('button', { className: 'btn sm', onclick: () => closeModal() }, 'ปิด')));
        return;
      }
      const rows = ((scan && scan.rows) || []).filter((r) => r.videoId === videoId);
      const results = chGet('trimResults', {});
      const up = uploadOf(videoId);
      const length = (rows[0] && rows[0].length) || 0;
      const src = h('textarea', { value: (up && (up.txt || '')) || '', placeholder: 'วาง tracklist เดิม (00:00 ศิลปิน - เพลง) หรือลากไฟล์ .txt มาวาง' });
      src.addEventListener('dragover', (e) => e.preventDefault());
      src.addEventListener('drop', async (e) => {
        const f = [...(e.dataTransfer?.files || [])].find(isTxt);
        if (!f) return;
        e.preventDefault();
        src.value = await readText(f);
        update();
      });
      const outBox = h('textarea', { readOnly: true });
      const info = h('div', { className: 'mut' });
      const segChecks = rows.flatMap((r) => r.segments.map((sg) => {
        const res = results[r.videoId + ':' + r.claimId];
        const cb = h('input', { type: 'checkbox', checked: !!(res && res.state === 'saved'), onchange: () => update() });
        cb._seg = sg;
        return h('label', { className: 'tbx-cb' }, cb, `${fmt(sg[0])}–${fmt(sg[1])} · ${r.song}`, res && res.state === 'saved' ? h('span', { className: 'tbx-ok' }, ' (ตัดแล้ว)') : null);
      }));
      function update() {
        const segs = [...m.box.querySelectorAll('.tbx-cb input')].filter((c) => c.checked).map((c) => c._seg);
        const r = fixTracklist(src.value, segs, length);
        outBox.value = r.text;
        info.textContent = segs.length
          ? `ตัด ${segs.length} ช่วง · ลบ ${r.removed.length} เพลง${r.removed.length ? ': ' + r.removed.join(', ') : ''} · เหลือ ${r.kept} เพลง`
          : 'ติ๊กช่วงที่ถูกตัด (หรือจะตัด) เพื่อดูผล';
      }
      src.addEventListener('input', update);
      const m = openModal(
        h('h3', {}, '📝 tracklist หลังตัดลิขสิทธิ์'),
        h('div', { className: 'mut', style: 'margin-bottom:8px' }, `${(rows[0] && rows[0].video) || videoId} · ความยาวเดิม ${fmt(length)}` + (up ? ' · ดึง tracklist จากประวัติการอัปโหลด' : '')),
        h('div', { className: 'lbl' }, 'ช่วงที่ตัด'),
        segChecks.length ? h('div', {}, segChecks) : h('div', { className: 'mut' }, 'ไม่มีข้อมูลช่วงเวลา — สแกน claim ใหม่ก่อน'),
        h('div', { className: 'lbl' }, 'tracklist เดิม'), src,
        h('div', { className: 'lbl' }, 'tracklist ใหม่'), outBox, info,
        h('div', { className: 'hint', style: 'margin-top:8px' }, icon('alert', 13),
          h('span', {}, 'เพลงที่ถูกตัดเกินครึ่งจะถูกลบ เวลาของเพลงหลังจุดตัดจะเลื่อนขึ้นตามความยาวที่ตัด ใช้หลังจาก YouTube ประมวลผลการตัดเสร็จแล้ว')),
        h('div', { className: 'row', style: 'margin-top:14px;justify-content:flex-end' },
          h('button', { className: 'btn sm', onclick: () => closeModal() }, 'ปิด'),
          h('button', { className: 'btn go sm', onclick: () => {
            GM_setClipboard(outBox.value);
            toast('คัดลอก tracklist ใหม่แล้ว ไปวางในคำอธิบายของวิดีโอได้เลย');
          } }, '📋 คัดลอก tracklist ใหม่')));
      m.box.style.width = 'min(760px,95vw)';
      update();
    }

    /* ---------- ทำงานแท็บเดียวต่อช่อง ---------- */
    const TAB_ID = (() => {
      try {
        let id = sessionStorage.getItem('tbxTabId');
        if (!id) { id = Math.random().toString(36).slice(2); sessionStorage.setItem('tbxTabId', id); }
        return id;
      } catch (e) { return Math.random().toString(36).slice(2); }
    })();
    function isWorker(force = false) {
      const key = 'tabLock:' + currentChannel();
      const l = load(key, null);
      const now = Date.now();
      if (force || !l || l.id === TAB_ID || now - l.ts > 20000) {
        save(key, { id: TAB_ID, ts: now });
        return true;
      }
      return false;
    }

    /* ---------- ประวัติเพลงที่โดน claim (ทุกช่อง) ---------- */
    const songNorm = (t) => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const getSongs = () => load('songHistory', {});
    const setSongs = (v) => save('songHistory', v);

    function recordSongs(rows, chName) {
      const db = getSongs();
      const now = new Date().toISOString();
      let added = 0;
      for (const r of rows) {
        if (!r.song || r.song === '(ไม่ทราบชื่อ)') continue;
        const key = songNorm(r.song) + '|' + songNorm(r.artists);
        let e = db[key];
        if (!e) {
          e = db[key] = { title: r.song, artists: r.artists || '', label: r.label || '', claimants: [], types: [], firstSeen: now, lastSeen: now, videos: {}, trimmed: 0 };
          added++;
        }
        e.lastSeen = now;
        if (r.claimant && !e.claimants.includes(r.claimant)) e.claimants.push(r.claimant);
        if (r.type && !e.types.includes(r.type)) e.types.push(r.type);
        if (r.label && !e.label) e.label = r.label;
        const v = e.videos[r.videoId] || (e.videos[r.videoId] = { video: r.video, channel: chName, status: 'claimed' });
        v.video = r.video;
        v.impact = r.impact || '';
      }
      setSongs(db);
      if (added) log(`🎵 เพิ่มเพลงใหม่ ${added} เพลงในประวัติ`, 'ok');
    }

    function markSongTrimmed(item) {
      const db = getSongs();
      const t = songNorm(item.song);
      for (const e of Object.values(db)) {
        if (songNorm(e.title) === t && e.videos[item.videoId] && e.videos[item.videoId].status !== 'trimmed') {
          e.videos[item.videoId].status = 'trimmed';
          e.trimmed = (e.trimmed || 0) + 1;
        }
      }
      setSongs(db);
    }

    function songsCSV() {
      const list = Object.values(getSongs());
      const head = ['song', 'artists', 'label', 'claimants', 'claim_type', 'videos_claimed', 'videos_trimmed', 'channels', 'first_seen', 'last_seen', 'videos'];
      const lines = list.map((e) => {
        const vids = Object.values(e.videos);
        return [e.title, e.artists, e.label, e.claimants.join('; '), e.types.join('; '), vids.length, e.trimmed || 0,
          [...new Set(vids.map((v) => v.channel))].join('; '), e.firstSeen.slice(0, 10), e.lastSeen.slice(0, 10), vids.map((v) => v.video).join(' | ')];
      });
      downloadCSV([head, ...lines], `claimed-songs-${new Date().toISOString().slice(0, 10)}.csv`);
    }

    // นำเข้า CSV ประวัติเพลงจากสคริปต์ YT Studio Helper เดิม (ปุ่ม ⬇ CSV ในหน้า Songs)
    function parseCSV(text) {
      const rows = [];
      let row = [], cell = '', q = false;
      text = text.replace(/^﻿/, '');
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (q) {
          if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
          else if (ch === '"') q = false;
          else cell += ch;
        } else if (ch === '"') q = true;
        else if (ch === ',') { row.push(cell); cell = ''; }
        else if (ch === '\n' || ch === '\r') {
          if (ch === '\r' && text[i + 1] === '\n') i++;
          row.push(cell); rows.push(row); row = []; cell = '';
        } else cell += ch;
      }
      if (cell || row.length) { row.push(cell); rows.push(row); }
      return rows.filter((r) => r.some((c) => c.trim()));
    }
    async function importSongsCSV(file) {
      const rows = parseCSV(await file.text());
      const head = (rows.shift() || []).map((x) => x.trim());
      const col = (n) => head.indexOf(n);
      if (col('song') < 0) return toast('ไฟล์นี้ไม่ใช่ CSV ประวัติเพลง (ต้องมีคอลัมน์ song)');
      const db = getSongs();
      let n = 0;
      for (const r of rows) {
        const g = (name) => (col(name) >= 0 ? r[col(name)] || '' : '');
        const title = g('song').trim();
        if (!title) continue;
        const key = songNorm(title) + '|' + songNorm(g('artists'));
        const e = db[key] || (db[key] = { title, artists: g('artists'), label: g('label'), claimants: [], types: [],
          firstSeen: (g('first_seen') || new Date().toISOString().slice(0, 10)) + 'T00:00:00Z',
          lastSeen: (g('last_seen') || new Date().toISOString().slice(0, 10)) + 'T00:00:00Z', videos: {}, trimmed: +g('videos_trimmed') || 0 });
        g('claimants').split(';').map((x) => x.trim()).filter(Boolean).forEach((c) => { if (!e.claimants.includes(c)) e.claimants.push(c); });
        g('claim_type').split(';').map((x) => x.trim()).filter(Boolean).forEach((c) => { if (!e.types.includes(c)) e.types.push(c); });
        g('videos').split('|').map((x) => x.trim()).filter(Boolean).forEach((v, i) => {
          const k = 'import:' + songNorm(v) + ':' + i;
          if (!Object.values(e.videos).some((x) => x.video === v)) e.videos[k] = { video: v, channel: g('channels').split(';')[0] || '', status: 'claimed' };
        });
        n++;
      }
      setSongs(db);
      toast(`นำเข้าประวัติเพลง ${n} เพลงแล้ว`);
      renderStatus();
      refreshClaimWarnings();
    }

    // ตรวจ tracklist ก่อนอัป: เพลงไหนเคยโดน claim
    const titleKey = (t) => songNorm(String(t).replace(/\([^)]*\)|\[[^\]]*\]/g, '').replace(/\b(ft|feat)\.?\b.*$/i, '')).replace(/[^\p{L}\p{N}]+/gu, '');
    function claimedSongsIn(txt) {
      if (!txt) return [];
      const db = Object.values(getSongs());
      if (!db.length) return [];
      const idx = db.map((e) => ({ e, k: titleKey(e.title), arts: e.artists.split(',').map((a) => songNorm(a)).filter((a) => a.length > 1) }))
        .filter((x) => x.k.length >= 3);
      const hits = [];
      for (const line of String(txt).split(/\r?\n/)) {
        const t = line.replace(/^\s*(\d{1,2}:)?\d{1,2}:\d{2}\s*[-–|]?\s*/, '').replace(/^\d{1,3}\.\s*/, '').trim();
        if (!t) continue;
        const parts = t.split(/\s[-–]\s/);
        const song = parts.length > 1 ? parts.slice(1).join(' - ') : t;
        const k = titleKey(song);
        const low = songNorm(t);
        const hit = idx.find((x) => (x.k === k || (k.length >= 6 && x.k.length >= 6 && (k.includes(x.k) || x.k.includes(k)))) &&
          (!x.arts.length || x.arts.some((a) => low.includes(a))));
        if (hit) hits.push({ line: t, song: hit.e.title, artists: hit.e.artists, times: Object.keys(hit.e.videos).length });
      }
      return hits;
    }
    function refreshClaimWarnings() { queue.forEach(updateItemUI); }

    function showSongs() {
      let sortBy = 'count';
      let q = '';
      const tbody = h('tbody', {});
      const countEl = h('span', { className: 'mut' });
      function draw() {
        const db = getSongs();
        let list = Object.entries(db).map(([key, e]) => Object.assign({ key, n: Object.keys(e.videos).length }, e));
        const total = list.length;
        if (q) list = list.filter((e) => songNorm(e.title + ' ' + e.artists + ' ' + e.label + ' ' + e.claimants.join(' ')).includes(songNorm(q)));
        list.sort((a, b) => sortBy === 'count' ? b.n - a.n || a.title.localeCompare(b.title)
          : sortBy === 'recent' ? b.lastSeen.localeCompare(a.lastSeen)
          : sortBy === 'artist' ? a.artists.localeCompare(b.artists) || a.title.localeCompare(b.title)
          : a.title.localeCompare(b.title));
        countEl.textContent = q ? `${list.length} จาก ${total} เพลง` : `${total} เพลง`;
        tbody.replaceChildren(...list.map((e) => {
          const vids = Object.values(e.videos);
          const channels = [...new Set(vids.map((v) => v.channel))].filter(Boolean).join(', ');
          const del = h('button', { className: 'btn sm', title: 'ลบออกจากประวัติ', onclick: () => {
            if (del.dataset.armed) { const d = getSongs(); delete d[e.key]; setSongs(d); draw(); refreshClaimWarnings(); }
            else { del.dataset.armed = '1'; del.textContent = 'แน่ใจ?'; }
          } }, '✕');
          return h('tr', {},
            h('td', {}, h('b', {}, e.title), e.types.length ? h('div', { className: 'mut' }, e.types.join(', ')) : null),
            h('td', {}, e.artists || '—', e.label ? h('div', { className: 'mut' }, e.label) : null),
            h('td', {}, e.claimants.join(', ') || '—'),
            h('td', { style: 'white-space:nowrap' }, h('b', {}, String(e.n)), ' คลิป', e.trimmed ? h('div', { className: 'tbx-ok' }, `✂ ตัดแล้ว ${e.trimmed}`) : null),
            h('td', { className: 'mut' }, channels),
            h('td', { className: 'mut', style: 'white-space:nowrap' }, new Date(e.lastSeen).toLocaleDateString('th-TH')),
            h('td', {}, del));
        }));
        if (!list.length) tbody.append(h('tr', {}, h('td', { colSpan: 7, className: 'mut', style: 'text-align:center;padding:16px' },
          total ? 'ไม่พบเพลงที่ค้นหา' : 'ยังไม่มีข้อมูล — กด "สแกน claim" หรือนำเข้า CSV จากสคริปต์เดิม')));
      }
      const search = h('input', { type: 'text', placeholder: 'ค้นหาเพลง ศิลปิน ค่าย หรือผู้ claim…', oninput: (e) => { q = e.target.value; draw(); } });
      const sortSel = h('select', { style: 'width:auto', onchange: (e) => { sortBy = e.target.value; draw(); } },
        h('option', { value: 'count' }, 'โดนบ่อยสุด'), h('option', { value: 'recent' }, 'ล่าสุด'),
        h('option', { value: 'title' }, 'ชื่อเพลง A–Z'), h('option', { value: 'artist' }, 'ศิลปิน A–Z'));
      const importIn = h('input', { type: 'file', accept: '.csv,text/csv', hidden: true, onchange: async (e) => { if (e.target.files[0]) await importSongsCSV(e.target.files[0]); e.target.value = ''; draw(); } });
      let clearArmed = false;
      const clearBtn = h('button', { className: 'btn sm danger', onclick: () => {
        if (!clearArmed) { clearArmed = true; clearBtn.textContent = 'กดอีกครั้งเพื่อลบทั้งหมด'; return; }
        setSongs({}); draw(); refreshClaimWarnings(); clearBtn.textContent = 'ลบทั้งหมด'; clearArmed = false;
      } }, 'ลบทั้งหมด');
      const m = openModal(
        h('h3', {}, '🎵 เพลงที่เคยโดน claim'),
        h('div', { className: 'mut', style: 'margin-bottom:10px' }, 'ทุกเพลงที่เคยโดน claim ในทุกช่องของคุณ เช็กก่อนใส่เพลงในมิกซ์ใหม่ (ตอนลาก .txt เข้าคิว สคริปต์จะเตือนให้อัตโนมัติ)'),
        h('div', { className: 'row', style: 'margin-bottom:10px' }, search, sortSel, countEl),
        h('div', { className: 'tbx-scroll' },
          h('table', { className: 'tbx-table' },
            h('thead', {}, h('tr', {}, ['เพลง', 'ศิลปิน', 'ผู้ claim', 'โดนใน', 'ช่อง', 'ล่าสุด', ''].map((t) => h('th', {}, t)))),
            tbody)),
        h('div', { className: 'row', style: 'margin-top:14px' },
          clearBtn, importIn,
          h('button', { className: 'btn sm', title: 'ไฟล์ claimed-songs-*.csv จากสคริปต์ YT Studio Helper เดิม', onclick: () => importIn.click() }, '⬆ นำเข้า CSV'),
          h('span', { style: 'flex:1' }),
          h('button', { className: 'btn sm', onclick: songsCSV }, '⬇ CSV'),
          h('button', { className: 'btn go sm', onclick: () => closeModal() }, 'ปิด')));
      m.box.style.width = 'min(1100px,95vw)';
      draw();
      search.focus();
    }

    /* ---------- โฆษณา: หาคลิปที่ปิดโฆษณาไว้ แล้วเปิด ---------- */
    const ADS_STEPS = ['เปิดคลิป', 'แก้สถานะ', 'เลือก On', 'ตอบคำถาม & Save', 'ตรวจผล'];
    let adsScanning = false;
    let adsStage = { idx: -1, detail: '' };
    const setAdsStage = (idx, detail = '') => { adsStage = { idx, detail }; renderStatus(); };
    const getAdsRun = () => chGet('adsRun', null);
    const setAdsRun = (r) => chSet('adsRun', r);

    async function scanAds({ show = true } = {}) {
      if (adsScanning || scanning) return null;
      if (!ycfg('INNERTUBE_CONTEXT')) { log('Studio ยังโหลดไม่เสร็จ ลองใหม่ในอีกไม่กี่วินาที', 'warn'); return null; }
      adsScanning = true;
      scanProg = { label: 'กำลังเช็กคลิปที่ปิดโฆษณา…', done: 0, total: 0 };
      try {
        const vids = await listVideos({ videoId: true, title: true, privacy: true, lengthSeconds: true, monetization: { all: true } }, 'กำลังเช็กคลิปที่ปิดโฆษณา…');
        const rows = vids.filter((v) => /_OFF$/.test(((v.monetization || {}).adMonetization || {}).userSetMonetization || ''))
          .map((v) => {
            const eff = ((v.monetization || {}).adMonetization || {}).effectiveStatus || '';
            return { videoId: v.videoId, video: v.title, privacy: short(v.privacy), length: +v.lengthSeconds || 0, ineligible: /INELIGIBLE/.test(eff), status: short(eff) };
          });
        chSet('adsScan', { date: new Date().toISOString(), total: vids.length, rows });
        const ok = rows.filter((r) => !r.ineligible).length;
        log(`💰 ${rows.length} จาก ${vids.length} คลิปปิดโฆษณาอยู่ (${ok} คลิปเปิดได้เลย)`, 'ok');
        flash('เช็กโฆษณาเสร็จแล้ว', `${rows.length} คลิปปิดโฆษณา · ${ok} คลิปพร้อมเปิด`);
        if (show) showAds();
        return rows;
      } catch (e) {
        log('เช็กโฆษณาไม่สำเร็จ: ' + e.message, 'err');
        return null;
      } finally {
        adsScanning = false;
        scanProg = null;
        renderStatus();
      }
    }

    function showAds() {
      const scan = chGet('adsScan', null);
      if (!scan) { scanAds(); return; }
      const results = chGet('adsResults', {});
      const picked = new Set(scan.rows.filter((r) => !r.ineligible && !(results[r.videoId] && results[r.videoId].state === 'on')).map((r) => r.videoId));
      const goBtn = h('button', { className: 'btn go sm', onclick: () => {
        const rows = scan.rows.filter((r) => picked.has(r.videoId));
        if (!rows.length) return;
        closeModal();
        startAdsRun(rows);
      } });
      const refresh = () => { goBtn.textContent = `💰 เปิดโฆษณา (${picked.size})`; goBtn.disabled = !picked.size; };
      const cbs = [];
      const table = h('table', { className: 'tbx-table' },
        h('thead', {}, h('tr', {}, ['', 'วิดีโอ', 'การเปิดเผย', 'สถานะจาก YouTube', 'ผล'].map((t) => h('th', {}, t)))),
        h('tbody', {}, scan.rows.map((r) => {
          const res = results[r.videoId];
          const cb = h('input', { type: 'checkbox', checked: picked.has(r.videoId), onchange: (e) => { e.target.checked ? picked.add(r.videoId) : picked.delete(r.videoId); refresh(); } });
          cb._r = r; cbs.push(cb);
          return h('tr', {},
            h('td', {}, cb),
            h('td', {}, h('a', { href: `/video/${r.videoId}/monetization`, target: '_blank' }, r.video), h('div', { className: 'mut' }, fmt(r.length))),
            h('td', {}, r.privacy),
            h('td', {}, r.ineligible ? h('span', { className: 'tbx-warn' }, '⚠ YouTube แจ้งว่าไม่มีสิทธิ์') : 'ปิดโฆษณาไว้ (ตั้งค่า)'),
            h('td', {}, res ? h('span', { className: res.state === 'on' ? 'tbx-ok' : 'tbx-err' }, res.state === 'on' ? '✅ เปิดแล้ว' : '❌ ' + res.msg) : ''));
        })));
      const sel = (fn) => { cbs.forEach((cb) => { cb.checked = fn(cb._r); cb.checked ? picked.add(cb._r.videoId) : picked.delete(cb._r.videoId); }); refresh(); };
      const ok = scan.rows.filter((r) => !r.ineligible).length;
      const m = openModal(
        h('h3', {}, `💰 คลิปที่ปิดโฆษณา — ${channelName()}`),
        h('div', { className: 'mut', style: 'margin-bottom:8px' }, `${scan.rows.length} จาก ${scan.total} คลิป · ${ok} คลิปแค่ปิดในการตั้งค่า · เช็กเมื่อ ${new Date(scan.date).toLocaleString('th-TH')}`),
        h('div', { className: 'mut', style: 'margin-bottom:8px' }, '"ไม่มีสิทธิ์" หมายถึง YouTube บล็อกโฆษณาเอง (เช่นโดน claim หรือติดนโยบาย) เปิดการตั้งค่าได้ แต่คลิปนั้นอาจยังไม่มีรายได้จนกว่าจะแก้สาเหตุ'),
        h('div', { className: 'chips', style: 'margin-bottom:8px' },
          h('span', { className: 'mut' }, 'เลือก:'),
          h('button', { className: 'chip', onclick: () => sel((r) => !r.ineligible) }, 'แค่ปิดในการตั้งค่า'),
          h('button', { className: 'chip', onclick: () => sel((r) => !r.ineligible && r.privacy === 'public') }, 'เฉพาะสาธารณะ'),
          h('button', { className: 'chip', onclick: () => sel(() => true) }, 'ทั้งหมด'),
          h('button', { className: 'chip', onclick: () => sel(() => false) }, 'ไม่เลือก')),
        scan.rows.length ? h('div', { className: 'tbx-scroll' }, table) : h('div', { className: 'tbx-ok' }, '🎉 ทุกคลิปเปิดโฆษณาแล้ว'),
        h('div', { className: 'row', style: 'margin-top:14px' },
          h('button', { className: 'btn sm', onclick: () => { closeModal(); scanAds(); } }, '↻ เช็กใหม่'),
          h('span', { style: 'flex:1' }),
          h('button', { className: 'btn sm', onclick: () => closeModal() }, 'ปิด'), goBtn));
      m.box.style.width = 'min(900px,95vw)';
      refresh();
    }

    function startAdsRun(rows) {
      const tr = getRun();
      if (tr && tr.active) { log('ยังตัดลิขสิทธิ์อยู่ — เปิดโฆษณาหลังตัดเสร็จ', 'warn'); return; }
      if (uploadBusy()) { log('คิวอัปโหลดยังทำงานอยู่ — การเปิดโฆษณาต้องเปลี่ยนหน้า จะเริ่มหลังคิวอัปโหลดเสร็จ', 'warn'); }
      isWorker(true);
      setAdsRun({ active: true, items: rows.map((r) => ({ videoId: r.videoId, video: r.video, state: 'pending', msg: '' })), started: new Date().toISOString() });
      log(`💰 กำลังเปิดโฆษณา ${rows.length} คลิป`, 'ok');
      adsStep();
    }
    function stopAdsRun(reason = 'เปิดโฆษณาเสร็จ') {
      const run = getAdsRun();
      if (!run || !run.active) return;
      run.active = false;
      setAdsRun(run);
      const on = run.items.filter((i) => i.state === 'on').length;
      const failed = run.items.filter((i) => i.state === 'failed').length;
      const left = run.items.filter((i) => i.state === 'pending').length;
      const summary = [`เปิดแล้ว ${on}`, failed ? `ไม่สำเร็จ ${failed}` : '', left ? `ยังไม่ได้ทำ ${left}` : ''].filter(Boolean).join(' · ');
      adsStage = { idx: -1, detail: '' };
      log(`${reason}: ${summary}`, 'ok');
      flash(reason, summary, failed ? 'err' : 'ok', 15000);
    }
    function setAdsResult(item, state, msg = '') {
      const res = chGet('adsResults', {});
      res[item.videoId] = { state, msg, date: new Date().toISOString() };
      chSet('adsResults', res);
      const run = getAdsRun();
      if (run) { const it = run.items.find((x) => x.videoId === item.videoId); if (it) { it.state = state; it.msg = msg; } setAdsRun(run); }
      log(`${state === 'on' ? '✅ เปิดโฆษณาแล้ว' : '❌ เปิดโฆษณาไม่สำเร็จ'}: ${item.video}${msg ? ' (' + msg + ')' : ''}`, state === 'on' ? 'ok' : 'err');
    }
    async function adsIsOn(videoId) {
      const j = await yti('creator/get_creator_videos', { failOnError: true, videoIds: [videoId], mask: { videoId: true, monetization: { all: true } } });
      const v = (j.videos || [])[0] || {};
      return /_ON$/.test(((v.monetization || {}).adMonetization || {}).userSetMonetization || '');
    }

    let adsBusy = false;
    async function adsStep() {
      const run = getAdsRun();
      if (!run || !run.active || adsBusy) return;
      const item = run.items.find((i) => i.state === 'pending');
      if (!item) return stopAdsRun();
      adsBusy = true;
      if (!location.pathname.startsWith(`/video/${item.videoId}/monetization`)) {
        if (uploadBusy()) { setAdsStage(-1, '⏸ รอคิวอัปโหลดว่างก่อน (ต้องเปลี่ยนหน้า) — อัปหรือลบคลิปที่ค้าง/ผิดพลาดในคิวออก'); adsBusy = false; return; }
        setAdsStage(0, 'กำลังเปิดหน้าการสร้างรายได้ของคลิป…');
        location.href = `/video/${item.videoId}/monetization`;
        return;
      }
      try {
        await adsOne(item);
      } catch (e) {
        setAdsResult(item, 'failed', e.message);
      }
      setAdsStage(-1, 'คลิปถัดไปในไม่กี่วินาที…');
      await sleep(3000);
      adsBusy = false;
    }

    async function adsOne(item) {
      if (await adsIsOn(item.videoId)) return setAdsResult(item, 'on', 'เปิดอยู่แล้ว');
      setAdsStage(1, 'กด "Edit video monetisation status"…');
      const box = await waitFor(() => { const b = document.querySelector('ytcp-video-monetization'); return b && visible(b) ? b : null; }, 25000);
      if (!box) throw new Error('ไม่พบส่วนการสร้างรายได้ในหน้า');
      await sleep(2500);
      let on = null;
      for (let i = 0; i < 4 && !on; i++) {
        const edit = [...box.querySelectorAll('ytcp-icon-button, button')].find((b) => visible(b) &&
          /moneti[sz]ation status/i.test(b.getAttribute('aria-label') || '')) || box.querySelector('ytcp-icon-button');
        if (!edit) throw new Error('ไม่พบปุ่ม "Edit video monetisation status"');
        edit.click();
        on = await waitFor(() => [...document.querySelectorAll('tp-yt-paper-radio-button#radio-on, tp-yt-paper-radio-button[name="ON"]')].find(visible), 3000);
        if (!on) await sleep(1500);
      }
      if (!on) throw new Error('ตัวเลือก On / Off ไม่เปิดขึ้นมา');
      setAdsStage(2, 'เลือก "On"…');
      on.click();
      await sleep(600);
      const pop = on.closest('tp-yt-paper-dialog') || document;
      const nextBtn = await waitFor(() => [...pop.querySelectorAll('button')].find((b) => visible(b) && /^(Next|Done)$/i.test(b.innerText.trim()) && !isDisabled(b)), 5000);
      if (nextBtn) nextBtn.click();
      const qDlg = await waitFor(() => [...document.querySelectorAll('tp-yt-paper-dialog')].find((d) => visible(d) && /Tell us what.s in your video/i.test(d.innerText)), 6000);
      if (qDlg) {
        setAdsStage(3, 'คำถามความเหมาะสม: ติ๊ก "None of the above"…');
        const submitBtn = () => [...qDlg.querySelectorAll('button')].find((b) => visible(b) && /^Submit$/i.test(b.innerText.trim()));
        const inner = qDlg.querySelector('[role="checkbox"][aria-label="None of the above"]') ||
          deepAll(qDlg, '[role="checkbox"]').find((e) => /None of the above/i.test(e.getAttribute('aria-label') || ''));
        if (!inner) throw new Error('ไม่พบ "None of the above" ในคำถาม');
        const host = inner.closest('ytcp-checkbox-lit') || inner;
        if (inner.getAttribute('aria-checked') !== 'true') host.click();
        let ready = await waitFor(() => { const b = submitBtn(); return b && !isDisabled(b) ? b : null; }, 3000);
        if (!ready && inner.getAttribute('aria-checked') !== 'true') { inner.click(); ready = await waitFor(() => { const b = submitBtn(); return b && !isDisabled(b) ? b : null; }, 3000); }
        if (!ready) throw new Error('ปุ่ม Submit ยังกดไม่ได้หลังติ๊ก "None of the above"');
        ready.click();
        const closed = await waitFor(() => !visible(qDlg), 15000);
        if (!closed) throw new Error('หน้าต่างคำถามไม่ปิดหลังกด Submit');
        await sleep(800);
      }
      setAdsStage(3, 'กด Save…');
      const saveHost = await waitFor(() => { const x = document.querySelector('ytcp-button#save'); return x && visible(x) && !isDisabled(x) ? x : null; }, 10000);
      if (!saveHost) throw new Error('ปุ่ม Save ไม่พร้อม');
      (saveHost.querySelector('button') || saveHost).click();
      const saved = await waitFor(() => { const x = document.querySelector('ytcp-button#save'); return x && isDisabled(x); }, 20000);
      const extra = [...document.querySelectorAll('tp-yt-paper-dialog')].find((d) => visible(d));
      if (!saved && extra) throw new Error('YouTube ถามเพิ่มหลัง Save: "' + extra.innerText.replace(/\s+/g, ' ').slice(0, 120) + '" — ทำคลิปนี้ด้วยมือ');
      setAdsStage(4, 'ตรวจกับ YouTube ว่าเปิดโฆษณาแล้ว…');
      let okNow = false;
      for (let i = 0; i < 5 && !okNow; i++) { await sleep(1500); okNow = await adsIsOn(item.videoId); }
      if (!okNow) throw new Error('บันทึกแล้ว แต่ YouTube ยังแจ้งว่าปิดโฆษณาอยู่');
      setAdsResult(item, 'on', qDlg ? 'ตอบคำถาม: none of the above' : '');
    }

    /* ---------- ตัดลิขสิทธิ์ (Take action → Trim out segment → Save) ---------- */
    const TRIM_LABEL = {
      pending: '⏳ รอ', saved: '✅ ตัดแล้ว', gone: '✅ claim หายไปแล้ว', failed: '❌ ไม่สำเร็จ',
      skipped: '⏭ ข้าม', later: '⏳ รอคิว — จะตัดหลังการตัดครั้งก่อนในคลิปนี้เสร็จ',
    };
    const getRun = () => chGet('trimRun', null);
    const setRun = (r) => chSet('trimRun', r);
    function setResult(item, state, msg = '') {
      const res = chGet('trimResults', {});
      res[item.key] = { state, msg, date: new Date().toISOString() };
      chSet('trimResults', res);
      const run = getRun();
      if (run && run.active) {
        const it = run.items.find((x) => x.key === item.key);
        if (it) { it.state = state; it.msg = msg; }
        setRun(run);
      }
      if (state === 'saved' || state === 'gone') chSet('trimQueue', chGet('trimQueue', []).filter((k) => k !== item.key));
      fuOnResult(item, state);
      log(`${TRIM_LABEL[state] || state}: ${item.video} — ${item.song}${msg ? ' (' + msg + ')' : ''}`,
        state === 'failed' ? 'err' : state === 'saved' || state === 'gone' ? 'ok' : 'warn');
    }

    function openTrimConfirm() {
      const scan = chGet('claimScan', null);
      const picked = new Set(chGet('trimQueue', []));
      const rows = (scan ? scan.rows : []).filter((r) => picked.has(r.videoId + ':' + r.claimId));
      if (!rows.length) return log('ยังไม่ได้เลือก claim', 'warn');
      const videos = new Set(rows.map((r) => r.videoId)).size;
      const own = rows.filter((r) => r.own).length;
      const total = rows.reduce((a, r) => a + r.claimedSec, 0);
      const mode = cfg().autoSaveTrim ? 'auto' : 'review';
      openModal(
        h('h3', {}, `ตัด ${rows.length} claim ใน ${videos} คลิป?`),
        h('div', { style: 'line-height:1.6' },
          `จะตัดภาพ + เสียงออกรวม ${fmt(total)} ด้วยเครื่องมือ "Trim out segment" ของ YouTube `,
          h('b', {}, 'การตัดที่บันทึกแล้วย้อนกลับไม่ได้'), ' และ YouTube ใช้เวลาประมวลผลหลายชั่วโมงต่อคลิป'),
        own ? h('div', { className: 'tbx-warn', style: 'margin-top:8px' }, `⚠ ${own} รายการเป็น claim บนเพลงของคุณเอง (★) ถ้าตัดจะเสียเพลงของตัวเองออกจากคลิป`) : null,
        uploadBusy() ? h('div', { className: 'tbx-warn', style: 'margin-top:8px' }, '⏸ คิวอัปโหลดยังมีไฟล์อยู่ การตัดต้องเปลี่ยนหน้า จะเริ่มหลังคิวอัปโหลดเสร็จ') : null,
        !studioIsEnglish() ? h('div', { className: 'tbx-err', style: 'margin-top:8px' }, '⚠ Studio ไม่ได้ตั้งเป็นภาษาอังกฤษ ปุ่มต่าง ๆ จะหาไม่เจอ — เปลี่ยนภาษาเป็น English ก่อน') : null,
        h('div', { className: 'mut', style: 'margin-top:8px' }, 'คลิปหนึ่งตัดได้ทีละครั้ง ถ้าคลิปเดียวมีหลาย claim จะตัดอันแรกก่อน ที่เหลือจะตัดต่อให้เองเมื่อ YouTube ประมวลผลเสร็จ'),
        h('div', { className: 'tbx-note' },
          mode === 'auto' ? '⚡ อัตโนมัติทั้งหมด: Save → "I acknowledge" → Confirm changes ทุก claim' : '👀 โหมดตรวจเอง: คุณกด Save และยืนยันการตัดเองทีละอัน',
          h('div', { className: 'mut' }, 'เปลี่ยนได้ที่ ⚙ ตั้งค่าลิขสิทธิ์ → "ตัดอัตโนมัติทั้งหมด"')),
        h('div', { className: 'row', style: 'margin-top:14px;justify-content:flex-end' },
          h('button', { className: 'btn sm', onclick: () => closeModal() }, 'ยกเลิก'),
          h('button', { className: 'btn go sm', onclick: () => { closeModal(); startTrimRun(rows, mode); } }, 'เริ่มตัด')));
    }

    function startTrimRun(rows, mode, fromFollowUp = false) {
      const cur = getRun();
      if (cur && cur.active) {
        log('ยังตัดชุดก่อนไม่เสร็จ — รอให้เสร็จหรือกดหยุดก่อน แล้วค่อยเริ่มชุดใหม่', 'warn');
        toast('ยังตัดชุดก่อนไม่เสร็จ');
        return;
      }
      const seen = new Set();
      const waiting = fromFollowUp ? {} : fuGet();
      const items = rows.map((r) => {
        const first = !seen.has(r.videoId) && !waiting[r.videoId];
        seen.add(r.videoId);
        return { key: r.videoId + ':' + r.claimId, videoId: r.videoId, claimId: r.claimId, song: r.song, video: r.video, state: first ? 'pending' : 'later', msg: '' };
      });
      // แก้บัคเดิม: ตั้ง run ใหม่ก่อน แล้วค่อยบันทึกผล "later" (เดิมไปแก้ items ของ run เก่า)
      setRun({ active: true, mode, items, started: new Date().toISOString(), channel: currentChannel() });
      items.filter((i) => i.state === 'later').forEach((i) => { fuAdd(i); setResult(i, 'later'); });
      fuNext = Date.now() + Math.max(2, parseFloat(cfg().followUpMinutes) || 10) * 60e3;
      isWorker(true);
      log(`เริ่มตัด (${mode === 'auto' ? 'บันทึกอัตโนมัติ' : 'ตรวจเองทีละอัน'}) — ${items.filter((i) => i.state === 'pending').length} รายการ`, 'ok');
      trimStep();
    }

    function stopTrimRun(reason = 'หยุดแล้ว') {
      const run = getRun();
      if (!run || !run.active) return;
      run.active = false;
      setRun(run);
      const c = run.items.reduce((a, i) => { a[i.state] = (a[i.state] || 0) + 1; return a; }, {});
      const summary = [`ตัดแล้ว ${c.saved || 0}`, c.gone ? `claim หายแล้ว ${c.gone}` : '', c.skipped ? `ข้าม ${c.skipped}` : '',
        c.failed ? `ไม่สำเร็จ ${c.failed}` : '', c.later ? `รอคิวตัดต่อ ${c.later}` : '', c.pending ? `ยังไม่ได้ทำ ${c.pending}` : ''].filter(Boolean).join(' · ');
      log(`${reason}: ${summary}`, 'ok');
      trimStage = { idx: -1, detail: '' };
      flash(reason, summary, c.failed ? 'err' : 'ok', 15000);
    }

    /* ---------- คลิปที่มีหลาย claim: รอให้การตัดครั้งก่อนเสร็จแล้วตัดต่อ ---------- */
    const fuGet = () => chGet('followUp', {});
    const fuSet = (v) => chSet('followUp', v);
    const fuHas = (videoId, claimId) => !!(fuGet()[videoId] || { pending: [] }).pending.some((p) => p.claimId === claimId);
    function fuAdd(item) {
      const fu = fuGet();
      const v = fu[item.videoId] || (fu[item.videoId] = { video: item.video, pending: [], lastClaimId: null, lastSavedAt: 0 });
      if (!v.pending.some((p) => p.claimId === item.claimId)) v.pending.push({ key: item.key, claimId: item.claimId, song: item.song, tries: 0 });
      fuSet(fu);
    }
    function fuOnResult(item, state) {
      if (state === 'saved') markSongTrimmed(item);
      const fu = fuGet();
      const v = fu[item.videoId];
      if (!v || state === 'later') return;
      const i = v.pending.findIndex((p) => p.claimId === item.claimId);
      if (state === 'saved') {
        v.lastClaimId = item.claimId;
        v.lastSavedAt = Date.now();
        if (i >= 0) v.pending.splice(i, 1);
      } else if (state === 'gone' || state === 'skipped') {
        if (i >= 0) v.pending.splice(i, 1);
      } else if (state === 'failed' && i >= 0) {
        v.pending[i].tries = (v.pending[i].tries || 0) + 1;
        if (v.pending[i].tries >= 3) v.pending.splice(i, 1);
      }
      if (!v.pending.length) delete fu[item.videoId];
      fuSet(fu);
    }
    const fuCount = () => Object.values(fuGet()).reduce((a, v) => a + v.pending.length, 0);

    let fuBusy = false;
    let fuNext = 0;
    async function fuCheck() {
      if (fuBusy || scanning) return;
      const run = getRun();
      if (run && run.active) return;
      const fu = fuGet();
      const vids = Object.keys(fu);
      if (!vids.length) return;
      fuBusy = true;
      fuNext = Date.now() + Math.max(2, parseFloat(cfg().followUpMinutes) || 10) * 60e3;
      try {
        const ready = [];
        for (const videoId of vids) {
          const v = fu[videoId];
          let j;
          try {
            j = await yti('creator/list_creator_received_claims', { videoId, criticalRead: true, includeLicensingOptions: false, isCreatorMusicV2: true });
          } catch (e) { log(`เช็กคลิป ${v.video} ไม่สำเร็จ: ${e.message}`, 'warn'); continue; }
          const active = {};
          (j.receivedClaims || []).forEach((c) => { if (c.status === 'RECEIVED_CLAIM_STATUS_ACTIVE') active[c.claimId] = c; });
          v.pending = v.pending.filter((p) => {
            if (active[p.claimId]) return true;
            const res = chGet('trimResults', {}); res[p.key] = { state: 'gone', msg: 'ปล่อยแล้ว', date: new Date().toISOString() }; chSet('trimResults', res);
            log(`✅ claim หายไปแล้ว: ${v.video} — ${p.song}`, 'ok');
            return false;
          });
          if (!v.pending.length) { delete fu[videoId]; continue; }
          const stillThere = v.lastClaimId && active[v.lastClaimId];
          const hours = (Date.now() - (v.lastSavedAt || 0)) / 3600e3;
          if (stillThere && hours < 48) {
            log(`⏳ ${v.video}: การตัดครั้งก่อนยังประมวลผล (${hours < 1 ? Math.round(hours * 60) + ' นาที' : hours.toFixed(1) + ' ชม.'}) — รอ ${v.pending.length} claim`);
            continue;
          }
          const next = v.pending.find((p) => ((active[p.claimId].nontakedownClaimActions || {}).options || []).includes('NON_TAKEDOWN_CLAIM_OPTION_TRIM'));
          if (!next) { log(`⏳ ${v.video}: ยังไม่มีตัวเลือก Trim — จะเช็กใหม่`); continue; }
          ready.push({ videoId, claimId: next.claimId, song: next.song, video: v.video });
        }
        fuSet(fu);
        if (ready.length) {
          log(`▶ ${ready.length} คลิปประมวลผลเสร็จแล้ว — ตัด claim ถัดไป`, 'ok');
          startTrimRun(ready, cfg().autoSaveTrim ? 'auto' : 'review', true);
        } else if (Object.keys(fu).length) {
          log(`เช็กครั้งถัดไป ${new Date(fuNext).toLocaleTimeString('th-TH').slice(0, 5)}`);
        }
      } finally {
        fuBusy = false;
      }
    }

    /* ---------- Auto-pilot ---------- */
    const getAP = () => chGet('autopilot', { on: false, next: 0 });
    const setAP = (v) => chSet('autopilot', v);
    function apPick(rows) {
      const c = cfg();
      const maxPct = parseFloat(c.apMaxPct) || 100;
      const results = chGet('trimResults', {});
      const out = [];
      // คลิปที่ตั้งเวลาปล่อยไว้และใกล้ถึงเวลา ตัดก่อน
      const sorted = rows.slice().sort((a, b) => (a.publishAt > Date.now() ? a.publishAt : Infinity) - (b.publishAt > Date.now() ? b.publishAt : Infinity));
      for (const r of sorted) {
        const res = results[r.videoId + ':' + r.claimId];
        if (res && (res.state === 'saved' || res.state === 'gone')) continue;
        if (!r.canTrim) continue;
        if (c.apSkipOwn && r.own) continue;
        if (c.apOnlyImpact && !r.hasImpact) continue;
        if (r.length && (r.claimedSec / r.length) * 100 > maxPct) continue;
        if (fuHas(r.videoId, r.claimId)) continue;
        out.push(r);
        if (out.length >= (parseInt(c.apMaxPerCycle, 10) || 10)) break;
      }
      return out;
    }

    let apBusy = false;
    async function apCycle() {
      if (apBusy || scanning) return;
      const run = getRun();
      if (run && run.active) return;
      apBusy = true;
      try {
        const hours = Math.max(0.5, parseFloat(cfg().apEveryHours) || 6);
        setAP(Object.assign(getAP(), { next: Date.now() + hours * 3600e3, last: Date.now() }));
        log(`🤖 Auto-pilot เริ่มรอบใหม่ที่ ${channelName()}`, 'ok');
        const rows = await scanClaims({ show: false });
        if (!rows) return;
        const pick = apPick(rows);
        if (!pick.length) {
          log(`🤖 ไม่มีอะไรต้องตัด เช็กครั้งถัดไป ${new Date(getAP().next).toLocaleString('th-TH')}`, 'ok');
          if (cfg().apAdsOn) {
            const adsRows = await scanAds({ show: false });
            const todo = (adsRows || []).filter((r) => !r.ineligible);
            if (todo.length) { log(`🤖 เปิดโฆษณา ${todo.length} คลิป`, 'warn'); startAdsRun(todo); }
          }
          return;
        }
        log(`🤖 ตัดอัตโนมัติ ${pick.length} claim`, 'warn');
        startTrimRun(pick, 'auto');
      } finally {
        apBusy = false;
      }
    }

    function toggleAutopilot() {
      const ap = getAP();
      if (ap.on) {
        setAP({ on: false, next: 0 });
        log('🤖 ปิด Auto-pilot ของ ' + channelName(), 'ok');
        renderStatus();
        return;
      }
      const c = cfg();
      const rules = [
        `ทุก ${c.apEveryHours} ชั่วโมง: สแกนช่องนี้ใหม่`,
        c.apOnlyImpact ? 'เฉพาะ claim ที่กระทบวิดีโอ (ไม่มีรายได้ / จำกัด / บล็อก)' : 'ทุก claim ที่ตัดได้',
        c.apSkipOwn ? `ไม่ตัดเพลงของตัวเอง (${c.ownNames})` : 'รวมเพลงของตัวเองด้วย',
        `ข้าม claim ที่ยาวเกิน ${c.apMaxPct}% ของคลิป`,
        `สูงสุด ${c.apMaxPerCycle} claim ต่อรอบ · คลิปที่ตั้งเวลาปล่อยไว้จะถูกตัดก่อน`,
      ];
      openModal(
        h('h3', {}, `เปิด Auto-pilot ให้ช่อง ${channelName()}?`),
        h('div', { style: 'line-height:1.6' }, 'สคริปต์จะสแกนและ ', h('b', {}, 'บันทึกการตัดโดยไม่ถาม'), ' — การตัดย้อนกลับไม่ได้'),
        h('ul', { style: 'line-height:1.7;margin:10px 0;padding-left:20px' }, rules.map((r) => h('li', {}, r))),
        h('div', { className: 'mut' }, 'ต้องเปิดแท็บ YouTube Studio ของช่องนี้ค้างไว้ 1 แท็บ และเครื่องไม่หลับ ระหว่างที่คิวอัปโหลดยังทำงาน Auto-pilot จะรอ'),
        h('div', { className: 'row', style: 'margin-top:14px;justify-content:flex-end' },
          h('button', { className: 'btn sm', onclick: () => closeModal() }, 'ยกเลิก'),
          h('button', { className: 'btn go sm', onclick: () => {
            closeModal();
            setAP({ on: true, next: 0 });
            log('🤖 เปิด Auto-pilot ของ ' + channelName(), 'ok');
            renderStatus();
          } }, 'เปิด')));
    }

    /* ---------- ยืนยัน "Confirm changes" ---------- */
    let confirmClickedAt = 0;
    document.addEventListener('click', (e) => {
      const b = e.target && e.target.closest && e.target.closest('button, ytcp-button');
      if (b && /^Confirm changes$/i.test((b.innerText || '').trim())) confirmClickedAt = Date.now();
    }, true);
    function findConfirmDialog() {
      return [...document.querySelectorAll('tp-yt-paper-dialog, ytcp-dialog, [role="dialog"]')].find((d) =>
        visible(d) && /Confirm changes/i.test(d.innerText) && /acknowledge/i.test(d.innerText) &&
        !d.querySelector('tp-yt-paper-dialog, [role="dialog"]')) || null;
    }
    function deepAll(rootEl, sel, out = []) {
      rootEl.querySelectorAll(sel).forEach((e) => out.push(e));
      rootEl.querySelectorAll('*').forEach((e) => { if (e.shadowRoot) deepAll(e.shadowRoot, sel, out); });
      return out;
    }
    function fullClick(el) {
      const r = el.getBoundingClientRect();
      const o = { bubbles: true, cancelable: true, composed: true, view: window, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
      el.dispatchEvent(new PointerEvent('pointerdown', o));
      el.dispatchEvent(new MouseEvent('mousedown', o));
      el.dispatchEvent(new PointerEvent('pointerup', o));
      el.dispatchEvent(new MouseEvent('mouseup', o));
      el.dispatchEvent(new MouseEvent('click', o));
    }
    let approving = false;
    async function approveConfirm(dlg) {
      if (approving) return false;
      approving = true;
      try {
        const confirmBtn = () => [...dlg.querySelectorAll('button')].find((b) => visible(b) && /^Confirm changes$/i.test(b.innerText.trim()));
        const ready = () => { const b = confirmBtn(); return b && !isDisabled(b) ? b : null; };
        if (!ready()) {
          const host = dlg.querySelector('ytcp-checkbox-lit, tp-yt-paper-checkbox, ytcp-checkbox');
          const inner = deepAll(dlg, '[role="checkbox"], input[type="checkbox"], #checkbox').find(visible);
          const label = [...dlg.querySelectorAll('*')].find((e) => e.childElementCount === 0 && /I acknowledge/i.test(e.textContent));
          const tries = [
            () => host && host.click(),
            () => inner && inner.click(),
            () => host && fullClick(host),
            () => inner && fullClick(inner),
            () => label && fullClick(label),
            () => { const t = inner || host; if (t) { t.focus && t.focus(); t.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', keyCode: 32, bubbles: true, composed: true }));
              t.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space', keyCode: 32, bubbles: true, composed: true })); } },
          ];
          for (const t of tries) {
            t();
            if (await waitFor(ready, 1200)) break;
            const tickedNow = [host, inner].some((e) => e && (e.getAttribute('aria-checked') === 'true' || e.checked === true || e.hasAttribute('checked')));
            if (tickedNow) { await waitFor(ready, 3000); break; }
          }
        }
        const btn = await waitFor(ready, 3000);
        if (!btn) {
          const info = deepAll(dlg, '[role="checkbox"], input[type="checkbox"], ytcp-checkbox-lit').map((e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '')).join(', ');
          log('ติ๊ก "I acknowledge" ไม่ได้ — ติ๊กเองด้วยมือ (เจอ: ' + (info || 'ไม่มี checkbox') + ')', 'err');
          return false;
        }
        btn.click();
        confirmClickedAt = Date.now();
        log('✔ ยืนยันการตัดแล้ว (YouTube จะประมวลผลภายในไม่กี่นาทีถึงหลายชั่วโมง)', 'ok');
        return true;
      } finally {
        approving = false;
      }
    }

    let trimBusy = false;
    async function trimStep() {
      const run = getRun();
      if (!run || !run.active || trimBusy) return;
      const item = run.items.find((i) => i.state === 'pending');
      if (!item) return stopTrimRun('ตัดเสร็จแล้ว');
      trimBusy = true;
      const path = `/video/${item.videoId}/claims`;
      if (!new RegExp(`^/video/${item.videoId}/(claims|copyright)`).test(location.pathname)) {
        if (uploadBusy()) { setTrimStage(-1, '⏸ รอคิวอัปโหลดว่างก่อน (ต้องเปลี่ยนหน้า) — อัปหรือลบคลิปที่ค้าง/ผิดพลาดในคิวออก'); trimBusy = false; return; }
        setTrimStage(0, 'กำลังเปิดหน้า claim ของคลิปนี้…');
        log(`กำลังเปิด ${item.video}…`);
        location.href = path;
        return;
      }
      try {
        await trimOne(item, run.mode);
      } catch (e) {
        setResult(item, 'failed', e.message);
      }
      setTrimStage(-1, 'claim ถัดไปในไม่กี่วินาที…');
      await sleep(4000);
      trimBusy = false;
    }

    const closeDialogs = () => document.querySelectorAll('tp-yt-paper-dialog').forEach((d) => {
      if (!visible(d)) return;
      const c = [...d.querySelectorAll('button')].find((b) => visible(b) && /^(Cancel|Close)$/i.test(b.innerText.trim()));
      c && c.click();
    });

    function pickRow(rows, allClaims, claim, song) {
      if (rows.length === 1) return rows[0];
      const t = songNorm(song);
      if (t) {
        const sameTitle = allClaims.filter((c) => songNorm(claimInfo(c).title) === t);
        const k = Math.max(0, sameTitle.findIndex((c) => c.claimId === claim.claimId));
        const hits = rows.filter((r) => songNorm(r.innerText).includes(t));
        if (hits.length === 1) return hits[0];
        if (hits.length > 1 && hits.length === sameTitle.length) return hits[k];
      }
      const idx = allClaims.findIndex((c) => c.claimId === claim.claimId);
      if (idx >= 0 && rows.length === allClaims.length) return rows[idx];
      const activeC = allClaims.filter((c) => c.status === 'RECEIVED_CLAIM_STATUS_ACTIVE');
      const aIdx = activeC.findIndex((c) => c.claimId === claim.claimId);
      if (aIdx >= 0 && rows.length === activeC.length) return rows[aIdx];
      return null;
    }

    async function trimOne(item, mode) {
      if (!studioIsEnglish()) throw new Error('Studio ไม่ได้ตั้งเป็นภาษาอังกฤษ — เปลี่ยนเป็น English แล้วลองใหม่');
      setTrimStage(1, 'เช็กว่า claim ยังอยู่…');
      const j = await yti('creator/list_creator_received_claims', { videoId: item.videoId, criticalRead: true, includeLicensingOptions: false, isCreatorMusicV2: true });
      const claim = (j.receivedClaims || []).find((c) => c.claimId === item.claimId);
      if (!claim || claim.status !== 'RECEIVED_CLAIM_STATUS_ACTIVE') return setResult(item, 'gone', claim ? short(claim.status) : 'ปล่อยแล้ว');
      const opts = (claim.nontakedownClaimActions || {}).options || [];
      if (!opts.includes('NON_TAKEDOWN_CLAIM_OPTION_TRIM')) return setResult(item, 'failed', 'ไม่มีตัวเลือก Trim แล้ว (คลิปอาจยังประมวลผลการแก้ครั้งก่อน)');
      const song = (claimInfo(claim).title || (item.song !== '(ไม่ทราบชื่อ)' ? item.song : '') || '').trim();
      const allClaims = j.receivedClaims || [];

      setTrimStage(2, 'หา claim ในหน้าแล้วกด "Take action"…');
      const rows = await waitFor(() => {
        const r = [...document.querySelectorAll('ytcr-video-content-list-row')].filter(visible);
        return r.length ? r : null;
      }, 25000);
      if (!rows) throw new Error('รายการ claim ไม่โหลด');
      const row = pickRow(rows, allClaims, claim, song);
      if (!row) throw new Error(`แยกไม่ออกว่าแถวไหนใน ${rows.length} claim คือ "${song || 'claim นี้'}" — ทำด้วยมือ`);
      const take = [...row.querySelectorAll('button')].find((b) => visible(b) && /^Take action$/i.test(b.innerText.trim()));
      if (!take) throw new Error('ไม่มีปุ่ม "Take action" สำหรับ claim นี้');
      take.click();

      const leaf = await waitFor(() => [...document.querySelectorAll('tp-yt-paper-dialog *')].find((e) =>
        visible(e) && e.childElementCount === 0 && /^Trim out segment$/i.test(e.textContent.trim())), 8000);
      if (!leaf) { closeDialogs(); throw new Error('ไม่มีตัวเลือก "Trim out segment"'); }
      const opt = leaf.closest('button') || leaf;
      if (isDisabled(opt)) { closeDialogs(); throw new Error('Trim ถูกปิดสำหรับ claim นี้'); }
      opt.click();
      const cont = await waitFor(() => findText(/^Continue$/i).find((b) => b.tagName === 'BUTTON' && !isDisabled(b)), 5000);
      if (!cont) { closeDialogs(); throw new Error('ปุ่ม Continue กดไม่ได้'); }
      cont.click();

      setTrimStage(3, 'เปิดหน้าตัด…');
      const dlg = await waitFor(() => {
        const d = document.querySelector('ytcr-editing-tool-dialog');
        return d && visible(d.querySelector('#continue-button')) ? d : null;
      }, 20000);
      if (!dlg) { closeDialogs(); throw new Error('หน้าตัดไม่เปิด'); }
      const times = (dlg.innerText.match(/Start time\s*([\d:]+)[\s\S]*?End time\s*([\d:]+)/) || []).slice(1).join('–');
      const saveBtn = dlg.querySelector('#continue-button button') || dlg.querySelector('#continue-button');
      let saveAt = 0;
      saveBtn.addEventListener('click', () => { saveAt = Date.now(); }, { capture: true });

      if (cfg().autoSaveTrim) mode = 'auto';
      if (mode === 'auto') {
        await sleep(1500);
        await waitFor(() => !isDisabled(saveBtn), 10000);
        setTrimStage(4, `บันทึกการตัด ${times}…`);
        log(`บันทึกการตัด ${times} ใน ${item.video}…`);
        saveBtn.click();
        saveAt = saveAt || Date.now();
      } else {
        setTrimStage(4, `👉 ตาคุณ: เช็กช่วง ${times} แล้วกด Save (หรือ Cancel เพื่อข้าม)`);
        log(`👉 เช็กช่วง ${times} ใน "${item.video}" แล้วกด Save (หรือ Cancel เพื่อข้าม)`, 'warn');
      }

      const t0 = Date.now();
      for (;;) {
        await sleep(700);
        const run = getRun();
        if (!run || !run.active) return;
        const cd = findConfirmDialog();
        if (cd && saveAt && confirmClickedAt < saveAt) {
          if (mode === 'auto') {
            setTrimStage(5, 'ติ๊ก "I acknowledge" แล้วกด "Confirm changes"…');
            await approveConfirm(cd);
          } else setTrimStage(5, '👉 ตาคุณ: ติ๊ก "I acknowledge" แล้วกด "Confirm changes"');
        }
        const open = visible(dlg.querySelector('tp-yt-paper-dialog')) || visible(dlg.querySelector('#continue-button')) || findConfirmDialog();
        if (!open) break;
        if (mode === 'auto' && Date.now() - t0 > 90000) throw new Error('ยืนยันการตัดไม่เสร็จภายใน 90 วินาที');
      }
      const saved = !!saveAt && confirmClickedAt >= saveAt;
      if (saved) {
        const extra = await waitFor(() => [...document.querySelectorAll('tp-yt-paper-dialog')].filter(visible)
          .map((d) => [...d.querySelectorAll('button')].find((b) => visible(b) && !isDisabled(b) && /^(OK|Got it|Done|Close)$/i.test(b.innerText.trim())))
          .find(Boolean), 3000);
        if (extra) extra.click();
      }
      setResult(item, saved ? 'saved' : 'skipped', saved ? times : 'ยกเลิก');
    }

    /* ---------- สถานะ ---------- */
    const TRIM_STEPS = ['เปิดคลิป', 'เช็ก claim', 'Take action', 'หน้าตัด', 'Save', 'ยืนยัน'];
    let trimStage = { idx: -1, detail: '' };
    let transient = null;
    let workerHere = true;
    const setTrimStage = (idx, detail = '') => { trimStage = { idx, detail }; renderStatus(); };
    function flash(title, detail = '', kind = 'ok', ms = 8000) {
      const ic = { ok: '✅', err: '⚠️', wait: '⏳', busy: '⚙️' }[kind] || 'ℹ️';
      transient = { icon: ic, title, detail, kind, until: Date.now() + ms };
      renderStatus();
    }
    const dur = (ms) => {
      const m = Math.max(0, Math.round(ms / 60000));
      return m < 60 ? `${m} นาที` : `${Math.floor(m / 60)} ชม. ${m % 60} นาที`;
    };

    function computeStatus() {
      const run = getRun();
      if (scanning || adsScanning) {
        const p = scanProg || { label: 'กำลังเริ่ม…' };
        return { icon: adsScanning ? '💰' : '🔍', kind: 'busy', title: adsScanning ? 'กำลังหาคลิปที่ปิดโฆษณา' : 'กำลังสแกน claim ของช่องนี้',
          detail: p.label, progress: p.total ? p.done / p.total : null };
      }
      const arun = getAdsRun();
      if (arun && arun.active) {
        const fin = arun.items.filter((i) => i.state !== 'pending').length;
        const cur = arun.items.find((i) => i.state === 'pending');
        return { icon: '💰', kind: 'busy', title: `กำลังเปิดโฆษณา คลิป ${Math.min(fin + 1, arun.items.length)} จาก ${arun.items.length}`,
          detail: cur ? cur.video : 'กำลังจบ…', progress: arun.items.length ? fin / arun.items.length : 0,
          steps: ADS_STEPS, stepIdx: workerHere ? adsStage.idx : -1, stepDetail: workerHere ? adsStage.detail : '↪ ทำงานอยู่ในแท็บ Studio อื่น' };
      }
      if (run && run.active) {
        const todo = run.items.filter((i) => i.state !== 'later');
        const finished = todo.filter((i) => i.state !== 'pending').length;
        const cur = todo.find((i) => i.state === 'pending');
        return { icon: '✂️', kind: 'busy', title: `กำลังตัด claim ${Math.min(finished + 1, todo.length)} จาก ${todo.length}`,
          detail: cur ? `${cur.video} — ${cur.song}` : 'กำลังจบ…', progress: todo.length ? finished / todo.length : 0,
          steps: TRIM_STEPS, stepIdx: workerHere ? trimStage.idx : -1, stepDetail: workerHere ? trimStage.detail : '↪ ทำงานอยู่ในแท็บ Studio อื่น' };
      }
      if (transient && transient.until > Date.now()) return transient;
      if (fuBusy) return { icon: '🔄', kind: 'busy', title: 'กำลังเช็กว่า YouTube ตัดครั้งก่อนเสร็จหรือยัง…', detail: '' };
      if (apBusy) return { icon: '🤖', kind: 'busy', title: 'Auto-pilot กำลังเริ่มรอบใหม่…', detail: '' };
      const waiting = fuCount();
      if (waiting) {
        const vids = Object.keys(fuGet()).length;
        return { icon: '⏳', kind: 'wait', title: 'รอ YouTube ประมวลผลการตัด',
          detail: `รอตัดอีก ${waiting} claim ใน ${vids} คลิป · เช็กครั้งถัดไปในอีก ${dur(fuNext - Date.now())}` };
      }
      const ap = getAP();
      if (ap.on) return { icon: '🤖', kind: 'ok', title: 'Auto-pilot เปิดอยู่', detail: uploadBusy() ? '⏸ รอคิวอัปโหลดเสร็จ' : `สแกน + ตัดครั้งถัดไปในอีก ${dur((ap.next || 0) - Date.now())}` };
      const scan = chGet('claimScan', null);
      if (scan) {
        const vids = new Set(scan.rows.map((r) => r.videoId)).size;
        return { icon: '✓', kind: 'idle', title: 'พร้อม', detail: `สแกนล่าสุด ${dur(Date.now() - new Date(scan.date).getTime())} ที่แล้ว: ${scan.rows.length} claim ใน ${vids} คลิป` };
      }
      return { icon: '✓', kind: 'idle', title: 'พร้อม', detail: 'กด "สแกน claim" เพื่อเช็กช่องนี้' };
    }

    /* ---------- แผงในแท็บ "ลิขสิทธิ์" ---------- */
    let logBox = null;
    function log(msg, type = '') {
      console.log('[Upload Studio]', msg);
      if (type === 'err') flash('มีเรื่องต้องดู', msg, 'err', 12000);
      if (!logBox) return;
      logBox.prepend(h('div', { className: type ? 'tbx-' + type : '' }, new Date().toLocaleTimeString('th-TH').slice(0, 5) + '  ' + msg));
      while (logBox.childElementCount > 80) logBox.lastChild.remove();
    }

    const UI = {};
    function buildPane() {
      logBox = h('div', { id: 'tbx-log', hidden: !load('logOpen', false) });
      UI.card = h('div', { className: 'tbx-card idle' });
      UI.lang = h('div', { className: 'tbx-note tbx-err', hidden: true },
        '⚠ Studio ตั้งเป็นภาษาไทยอยู่ — ส่วนตัด claim / เปิดโฆษณาอัตโนมัติต้องใช้ Studio ภาษาอังกฤษ (รูปโปรไฟล์ → Language → English) การสแกนใช้ได้ทุกภาษา');
      UI.scanBtn = h('button', { className: 'btn go', onclick: () => scanClaims() }, icon('refresh', 14), 'สแกน claim');
      UI.adsBtn = h('button', { className: 'btn', onclick: () => (chGet('adsScan', null) ? showAds() : scanAds()), title: 'หาคลิปที่ปิดโฆษณาแล้วเปิดให้' }, '💰 โฆษณาปิดอยู่');
      UI.stopBtn = h('button', { className: 'btn danger', onclick: () => { stopTrimRun('คุณกดหยุด'); stopAdsRun('คุณกดหยุด'); renderStatus(); } }, icon('stop', 14), 'หยุด');
      UI.listBtn = h('button', { className: 'btn', onclick: showClaims }, '📋 รายการ claim');
      UI.songBtn = h('button', { className: 'btn', onclick: showSongs, title: 'เพลงและศิลปินที่เคยโดน claim ทุกช่อง' }, '🎵 เพลงที่เคยโดน');
      UI.apTog = h('input', { type: 'checkbox', onclick: (e) => { e.preventDefault(); toggleAutopilot(); } });
      UI.apSub = h('small');
      UI.logBtn = h('button', { className: 'btn ghost sm', onclick: () => {
        logBox.hidden = !logBox.hidden;
        save('logOpen', !logBox.hidden);
        UI.logBtn.textContent = logBox.hidden ? 'แสดงกิจกรรม ▾' : 'ซ่อนกิจกรรม ▴';
      } }, logBox.hidden ? 'แสดงกิจกรรม ▾' : 'ซ่อนกิจกรรม ▴');
      UI.row1 = h('div', { className: 'tbx-grid3' }, UI.scanBtn, UI.adsBtn, UI.stopBtn);
      UI.row2 = h('div', { className: 'tbx-grid2' }, UI.listBtn, UI.songBtn);
      return h('div', {},
        UI.lang,
        h('div', { className: 'sec' }, h('h4', {}, icon('shield', 13), 'สถานะ'), UI.card, UI.row1, UI.row2),
        h('div', { className: 'sec' },
          h('label', { className: 'sw' }, UI.apTog, h('span', { className: 't' }), h('span', {}, h('b', {}, '🤖 Auto-pilot'), UI.apSub)),
          h('div', { className: 'row', style: 'margin-top:6px;flex-wrap:wrap' },
            h('button', { className: 'btn sm', onclick: openSettings }, icon('sliders', 13), 'ตั้งค่าลิขสิทธิ์'),
            h('button', { className: 'btn sm', onclick: () => showTracklistFix('') }, '📝 แก้ tracklist'),
            h('button', { className: 'btn sm', onclick: uploadsCSV, title: 'ประวัติคลิปที่อัปผ่านสคริปต์นี้' }, '⬇ ประวัติการอัป'))),
        h('div', { className: 'sec' }, h('div', { className: 'row' }, h('b', { style: 'flex:1' }, 'กิจกรรม'), UI.logBtn), logBox));
    }

    function renderStatus() {
      if (!UI.card) return;
      const s = computeStatus();
      const run = getRun();
      const arun = getAdsRun();
      const busyRun = !!(run && run.active) || !!(arun && arun.active);
      const busyScan = scanning || adsScanning;
      UI.card.className = 'tbx-card ' + (s.kind || 'idle');
      const kids = [h('div', { className: 'ti' }, h('span', {}, s.icon), h('span', {}, s.title))];
      if (s.detail) kids.push(h('div', { className: 'de' }, s.detail));
      if (s.progress !== undefined) kids.push(h('div', { className: 'tbx-bar' + (s.progress === null ? ' ind' : '') }, h('i', { style: `width:${Math.round((s.progress || 0) * 100)}%` })));
      if (s.steps) {
        kids.push(h('div', { className: 'tbx-steps' }, s.steps.map((t, i) =>
          h('span', { className: i < s.stepIdx ? 'done' : i === s.stepIdx ? 'now' : '' }, (i < s.stepIdx ? '✓ ' : i === s.stepIdx ? '● ' : '') + t))));
        if (s.stepDetail) kids.push(h('div', { className: 'tbx-sd' }, s.stepDetail));
      }
      UI.card.replaceChildren(...kids);
      const scan = chGet('claimScan', null);
      UI.listBtn.textContent = scan ? `📋 รายการ claim (${scan.rows.length})` : '📋 รายการ claim';
      UI.songBtn.textContent = `🎵 เพลงที่เคยโดน (${Object.keys(getSongs()).length})`;
      const adsScan = chGet('adsScan', null);
      UI.adsBtn.textContent = adsScan ? `💰 โฆษณาปิดอยู่ (${adsScan.rows.filter((r) => !(chGet('adsResults', {})[r.videoId] || {}).state).length})` : '💰 โฆษณาปิดอยู่';
      UI.scanBtn.hidden = UI.adsBtn.hidden = busyRun || busyScan;
      UI.stopBtn.hidden = !busyRun;
      UI.row2.hidden = busyRun || busyScan;
      UI.row1.className = busyRun ? 'tbx-grid1' : 'tbx-grid3';
      const ap = getAP();
      UI.apTog.checked = !!ap.on;
      const c = cfg();
      UI.apSub.textContent = ap.on ? `เปิด · สแกน + ตัดทุก ${c.apEveryHours} ชม.` : 'ปิด · สแกนและตัดอัตโนมัติตามรอบเวลา';
      UI.lang.hidden = studioIsEnglish();
      if (tabCount.claims) tabCount.claims.textContent = busyRun ? '●' : '';
    }

    /* ---------- ตั้งค่า ---------- */
    const SETTINGS = [
      { title: 'Claim และการตัด', items: [
        ['ownNames', 'ชื่อศิลปิน / ค่ายของตัวเอง', 'claim ที่มีชื่อเหล่านี้จะถูกมาร์ก ★ เพลงของคุณเอง (คั่นด้วย ,)'],
        ['autoSaveTrim', 'ตัดอัตโนมัติทั้งหมด', 'กด Save ในหน้าตัด → ติ๊ก "I acknowledge" → กด "Confirm changes" ให้ ถ้าปิด คุณต้องยืนยันเองทีละอัน'],
        ['autoSaveManualTrim', 'ตอนตัดเองด้วยมือ: กด Save และ Confirm changes ให้อัตโนมัติ', 'ปิดไว้ดีกว่า — ถ้าเปิด สคริปต์จะกด Save หลังเปิดหน้าตัด 1.5 วินาที และยืนยันทุกหน้าต่าง "Confirm changes" (รวม mute / replace song) ให้ทันที'],
        ['followUpMinutes', 'เช็กทุก N นาที', 'คลิปที่มี 2 claim ขึ้นไป: ความถี่ในการเช็กว่าการตัดครั้งก่อนเสร็จหรือยัง'],
      ] },
      { title: 'Auto-pilot', items: [
        ['apEveryHours', 'ทำงานทุก N ชั่วโมง'],
        ['apOnlyImpact', 'เฉพาะ claim ที่กระทบวิดีโอ (ไม่มีรายได้ / จำกัด / บล็อก)'],
        ['apSkipOwn', 'ไม่ตัดเพลงของตัวเอง (★)'],
        ['apMaxPct', 'ข้าม claim ที่ยาวเกิน N % ของคลิป'],
        ['apMaxPerCycle', 'จำนวน claim สูงสุดต่อรอบ'],
        ['apAdsOn', 'เปิดโฆษณาให้คลิปที่ปิดไว้ด้วย', 'เฉพาะคลิปที่ปิดในการตั้งค่า ไม่รวมคลิปที่ YouTube แจ้งว่าไม่มีสิทธิ์'],
      ] },
    ];
    function openSettings() {
      const c = cfg();
      const fields = {};
      const kids = [h('h3', {}, '⚙ ตั้งค่าลิขสิทธิ์')];
      for (const sc of SETTINGS) {
        kids.push(h('div', { className: 'tbx-sec' }, sc.title));
        for (const [k, label, hint] of sc.items) {
          let input;
          if (typeof DEFAULTS[k] === 'boolean') {
            input = h('input', { type: 'checkbox', checked: c[k] });
            kids.push(h('label', { className: 'tbx-cb' }, input, h('span', {}, label, hint ? h('div', { className: 'mut' }, hint) : null)));
          } else {
            input = h('input', { type: 'text', value: c[k] });
            kids.push(h('div', { className: 'lbl' }, h('span', {}, label), hint ? h('span', {}, hint) : null), input);
          }
          fields[k] = input;
        }
      }
      let resetArmed = false;
      const resetBtn = h('button', { className: 'btn sm danger', onclick: () => {
        if (!resetArmed) { resetArmed = true; resetBtn.textContent = 'กดอีกครั้งเพื่อคืนค่า'; return; }
        saveCfg({}); closeModal(); renderStatus(); log('คืนค่าตั้งค่าลิขสิทธิ์แล้ว', 'ok');
      } }, 'คืนค่าเริ่มต้น');
      kids.push(h('div', { className: 'row', style: 'margin-top:16px' },
        resetBtn, h('span', { style: 'flex:1' }),
        h('button', { className: 'btn sm', onclick: () => closeModal() }, 'ยกเลิก'),
        h('button', { className: 'btn go sm', onclick: () => {
          const n = Object.assign({}, cfg());
          for (const [k, el] of Object.entries(fields)) n[k] = el.type === 'checkbox' ? el.checked : el.value;
          saveCfg(n); closeModal(); renderStatus(); flash('บันทึกการตั้งค่าแล้ว');
        } }, 'บันทึก')));
      openModal(...kids);
    }

    /* ---------- loop หลัก (ส่วนลิขสิทธิ์) ---------- */
    let trimStarting = false;
    function tick() {
      const run = getRun();
      const running2 = !!(run && run.active);
      const busy = trimBusy || scanning || apBusy || fuBusy || adsBusy || adsScanning;
      const ready = !!ycfg('INNERTUBE_CONTEXT') && isWorker(busy);
      workerHere = ready;
      const arun = getAdsRun();
      const adsRunning = !!(arun && arun.active);
      // งานที่ต้องเปลี่ยนหน้า (ตัด / เปิดโฆษณา) รอจนคิวอัปโหลดว่าง
      const canNavigate = !uploadBusy();
      if (ready && canNavigate && adsRunning && !running2 && !adsBusy && !trimStarting) {
        trimStarting = true;
        setTimeout(() => { trimStarting = false; adsStep(); }, 2500);
      }
      const ap = getAP();
      if (ready && canNavigate && !adsRunning && !adsScanning && ap.on && !running2 && !apBusy && !scanning && Date.now() >= (ap.next || 0)) apCycle();
      if (ready && canNavigate && !adsRunning && !adsScanning && !running2 && !apBusy && !scanning && !fuBusy && Date.now() >= fuNext && fuCount()) fuCheck();
      if (ready && canNavigate && running2 && !trimBusy && !trimStarting) {
        trimStarting = true;
        setTimeout(() => { trimStarting = false; trimStep(); }, 2500);
      }
      // ตัดเองด้วยมือในหน้า claim: กด Save ให้เฉพาะเมื่อเปิดตั้งค่าไว้ / ยืนยัน "Confirm changes" ให้เมื่อเปิดตัดอัตโนมัติ
      const c = cfg();
      if (!running2 && /\/video\/[^/]+\/(claims|copyright)/.test(location.pathname)) {
        if (c.autoSaveManualTrim) {
          const ed = document.querySelector('ytcr-editing-tool-dialog');
          const sb = ed && (ed.querySelector('#continue-button button') || ed.querySelector('#continue-button'));
          if (visible(sb) && !isDisabled(sb) && !findConfirmDialog() && !ed.__tbxSaving) {
            ed.__tbxSaving = true;
            setTimeout(() => {
              if (visible(sb) && !isDisabled(sb)) { log('บันทึกการตัดให้อัตโนมัติ…'); sb.click(); }
              setTimeout(() => { ed.__tbxSaving = false; }, 10000);
            }, 1500);
          }
        }
        if (c.autoSaveManualTrim) {
          const cd = findConfirmDialog();
          if (cd && !cd.__tbxSeen) { cd.__tbxSeen = true; approveConfirm(cd).then(() => setTimeout(() => { cd.__tbxSeen = false; }, 8000)); }
        }
      }
      renderStatus();
    }

    return { buildPane, tick, claimedSongsIn, fixTracklist, renderStatus };
  })();
  panes.claims = Claims.buildPane();
  setInterval(() => Claims.tick(), 800);

  document.addEventListener('keydown', (e) => {
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.code === 'KeyP') {
      drawer.classList.contains('open') ? closeDrawer() : openDrawer();
      e.preventDefault();
    } else if (/^Digit[1-9]$/.test(e.code)) {
      const p = presets[Number(e.code.slice(5)) - 1];
      if (p) {
        activeId = p.id;
        save('activeId', activeId);
        refreshLabels();
        toast(`พรีเซ็ตหลัก: ${p.label}`);
        e.preventDefault();
      }
    }
  });

  root.classList.toggle('dark', document.documentElement.hasAttribute('dark'));
  root.append(fab, drawer, toastEl);
  document.body.append(root);
  showTab('queue');
  refreshLabels();
  renderQueue();
  updateChannelUI();
})();
