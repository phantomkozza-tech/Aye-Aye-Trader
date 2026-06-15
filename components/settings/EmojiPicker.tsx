"use client";

import { useState, useRef, useEffect } from "react";

// ── Catalog (ported from index.html, expanded with more emoji per category) ──
interface Cat { icon: string; name: string; list: string[] }
const split = (s: string) => s.split(" ").filter(Boolean);

const EMOJI_CATS: Cat[] = [
  { icon: "😀", name: "Smileys", list: split("😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 🫠 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😙 🥲 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🫢 🤫 🤔 🫡 🤐 🤨 😐 😑 😶 🫥 😶‍🌫️ 😏 😒 🙄 😬 😮‍💨 🤥 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🤧 🥵 🥶 🥴 😵 😵‍💫 🤯 🤠 🥳 🥸 😎 🤓 🧐 😕 🫤 😟 🙁 ☹️ 😮 😯 😲 😳 🥺 🥹 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 ☠️ 💩 🤡 👹 👺 👻 👽 👾 🤖") },
  { icon: "👋", name: "People", list: split("👋 🤚 🖐️ ✋ 🖖 🫱 🫲 🫳 🫴 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 🖕 👇 ☝️ 🫵 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 🫶 👐 🤲 🙏 ✍️ 💅 🤳 💪 🦾 🦿 🧠 🫀 🫁 👀 👁️ 👅 👄 🫦 🧑 👶 🧒 🧓 👴 👵 🙇 🤦 🤷 💁 🙅 🙆 🙋 🧏 💆 💇 🚶 🏃 🧍 🕺 💃 🧗 🤺 🏇") },
  { icon: "🐺", name: "Animals", list: split("🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐻‍❄️ 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐒 🦍 🦧 🐔 🐧 🐦 🐤 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🦓 🦒 🐝 🪲 🐛 🦋 🐌 🐞 🐢 🐍 🦖 🦕 🐙 🦑 🦐 🦞 🦀 🐡 🐠 🐟 🐬 🐳 🐋 🦈 🐊 🐅 🐆 🦏 🦛 🐘 🦣 🐪 🐫 🦙 🐎 🐂 🐏 🐑 🐐 🦌 🐕 🐈 🐓 🦃 🦚 🦜 🕊️ 🦩 🐲 🐉") },
  { icon: "🍔", name: "Food", list: split("🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🍆 🥑 🥦 🥬 🥒 🌶️ 🫑 🌽 🥕 🫒 🧄 🧅 🥔 🍠 🥐 🥯 🍞 🥖 🥨 🧀 🥚 🍳 🧈 🥞 🧇 🥓 🥩 🍗 🍖 🌭 🍔 🍟 🍕 🫓 🥪 🌮 🌯 🫔 🥗 🍣 🍱 🍜 🍝 🍛 🍲 🫕 🍦 🍰 🎂 🧁 🥧 🍫 🍬 🍭 🍩 🍪 🌰 🍯 ☕ 🫖 🍵 🍺 🍻 🍷 🥃 🍸 🍹 🧋 🥤 🧃") },
  { icon: "⚽", name: "Activity", list: split("⚽ 🏀 🏈 ⚾ 🥎 🎾 🏐 🏉 🥏 🎱 🪀 🏓 🏸 🥅 🏒 🏑 🥍 🏏 🪃 ⛳ 🪁 🏹 🎣 🤿 🥊 🥋 🎽 🛹 🛼 🛷 ⛸️ 🥌 🎿 ⛷️ 🏂 🏋️ 🤼 🤸 🤺 🤾 🏌️ 🏇 🧘 🏄 🏊 🤽 🚣 🧗 🚵 🚴 🏆 🥇 🥈 🥉 🏅 🎖️ 🏵️ 🎗️ 🎫 🎟️ 🎪 🎭 🎨 🎬 🎤 🎧 🎼 🎹 🥁 🎷 🎺 🎸 🪕 🎻 🎲 🎯 🎳 🎮 🎰 🧩") },
  { icon: "✈️", name: "Travel", list: split("🚗 🚕 🚙 🚌 🚎 🏎️ 🚓 🚑 🚒 🚐 🛻 🚚 🚛 🚜 🛵 🏍️ 🛺 🚲 🛴 🛹 🚂 🚆 🚄 🚅 🚈 🚉 🚊 🚝 🚞 🚋 🚃 🚎 🚀 🛸 🚁 🛶 ⛵ 🚤 🛥️ 🛳️ ⛴️ 🚢 ⚓ ⛽ 🚧 🚦 🚥 🗺️ 🗿 🗽 🗼 🏰 🏯 🏟️ 🎡 🎢 🎠 ⛲ ⛱️ 🏖️ 🏝️ 🏜️ 🌋 ⛰️ 🏔️ 🗻 🏕️ ⛺ 🏠 🏡 🏘️ 🏙️ 🌃 🌆 🌇 🌉 🌁 🌌 🌠 🎇 🎆 🌅 🌄 🌈") },
  { icon: "💡", name: "Objects", list: split("⌚ 📱 💻 ⌨️ 🖥️ 🖨️ 🖱️ 💽 💾 💿 📀 📼 📷 📸 🎥 📞 ☎️ 📟 📺 📻 🎙️ ⏰ ⏲️ ⏳ ⌛ 📡 🔋 🪫 🔌 💡 🔦 🕯️ 🧯 🛢️ 💸 💵 💴 💶 💷 🪙 💰 💳 🧾 💎 ⚖️ 🪜 🧰 🔧 🔨 ⚒️ 🛠️ ⚙️ 🔩 ⛓️ 🧲 🔫 💣 🪓 🔪 🚬 🔑 🗝️ 🔒 🔓 📈 📉 📊 📋 📌 📍 📎 ✂️ 📝 ✏️ 🖊️ 🖋️ 🔍 🔎 🔭 🔬 📖 📚 🗂️ 📅 🗒️") },
  { icon: "❤️", name: "Symbols", list: split("❤️ 🩷 🧡 💛 💚 💙 🩵 💜 🖤 🩶 🤍 🤎 💔 ❤️‍🔥 ❤️‍🩹 ❣️ 💕 💞 💓 💗 💖 💘 💝 💯 ✅ ☑️ ✔️ ❌ ❎ ❗ ❕ ❓ ❔ ⚠️ 🚫 ⛔ 💢 💥 💫 💦 💨 🔥 ⚡ ☀️ 🌙 ⭐ 🌟 ✨ 🌠 ☄️ 🔔 🔕 🎵 🎶 ➕ ➖ ✖️ ➗ ♾️ 🔆 🔅 ⚜️ 🔱 ⚔️ 🛡️ 👑 🥷 🍀 🎲 🃏 ♠️ ♥️ ♦️ ♣️ 🆗 🆒 🆕 🔝 ✳️ ❇️") },
];

// keyword index for search (trading-relevant entries enriched)
const EMOJI_KEYWORDS: Record<string, string> = {
  "🖕": "middle finger flip rude", "🔥": "fire hot lit hot streak", "🚀": "rocket moon up pump",
  "💎": "diamond hands gem hold", "🧠": "brain smart mind iq", "📈": "chart up gains green bull pump",
  "📉": "chart down loss red bear dump", "💰": "money bag cash profit", "💵": "money dollar cash",
  "💸": "money fly loss burned", "🪙": "coin money crypto", "🎯": "target goal aim", "🦍": "ape gorilla apes together",
  "🐺": "wolf wallstreet", "🥷": "ninja stealth", "👑": "crown king goat", "🍀": "luck clover lucky",
  "⚔️": "swords fight battle", "🛡️": "shield defense", "😭": "cry sob sad rekt", "😡": "angry mad rage tilt",
  "🤬": "cursing angry swear tilt", "😎": "cool sunglasses confident", "🥳": "party celebrate win",
  "💀": "skull dead rekt blown", "☠️": "skull dead blown rip", "🤡": "clown joker fool", "😈": "devil evil",
  "🎰": "slot gamble casino degen", "🧊": "ice cold patient", "⚡": "lightning fast power scalp",
  "😤": "frustrated steam tilt", "🤑": "money face rich greed", "🙏": "pray hope thanks copium",
  "💪": "strong muscle conviction", "👍": "thumbs up good yes", "👎": "thumbs down bad no",
  "✅": "check done yes win", "❌": "cross no wrong loss", "⚠️": "warning caution risk", "💯": "hundred perfect a+",
  "🐂": "bull bullish long", "🐻": "bear bearish short", "🎲": "dice gamble luck", "🃏": "card joker wild",
  "📊": "chart bars data", "📋": "clipboard plan checklist", "🧘": "calm zen patience discipline",
  "😶‍🌫️": "foggy unclear confused", "🫡": "salute respect discipline", "🤝": "deal handshake agree",
};

const TRIGGER: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 8,
  background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 10,
  padding: "8px 14px", cursor: "pointer", fontSize: 24, color: "var(--txt)", lineHeight: 1,
};

export default function EmojiPicker({ value, onChange }: { value: string; onChange: (e: string) => void }) {
  const [open, setOpen] = useState(false);
  const [activeCat, setActiveCat] = useState(0);
  const [search, setSearch] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [open]);

  const q = search.trim().toLowerCase();
  const grid: string[] = q
    ? [...new Set(EMOJI_CATS.flatMap((c) => c.list))].filter((e) => {
        const kw = EMOJI_KEYWORDS[e] || "";
        return kw.includes(q) || e === q;
      })
    : EMOJI_CATS[activeCat].list;

  const pick = (e: string) => { onChange(e); setOpen(false); setSearch(""); };

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-block" }}>
      <button type="button" style={TRIGGER}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        onMouseOver={(e) => (e.currentTarget.style.borderColor = "var(--green)")}
        onMouseOut={(e) => (e.currentTarget.style.borderColor = "var(--line)")}>
        <span>{value || "😮‍💨"}</span>
        <span style={{ fontSize: 11, color: "var(--mut)" }}>▾ change</span>
      </button>

      {open && (
        <div onClick={(e) => e.stopPropagation()} style={{
          position: "absolute", top: "100%", left: 0, marginTop: 8, width: 320, maxWidth: "92vw",
          background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 14,
          boxShadow: "0 16px 40px rgba(0,0,0,.35)", padding: 12, zIndex: 60,
        }}>
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search emoji… (e.g. fire, loss, win)"
            autoFocus
            style={{ width: "100%", background: "var(--panel2)", border: "1px solid var(--line)",
              color: "var(--txt)", padding: "9px 12px", borderRadius: 8, fontSize: 13, outline: "none", marginBottom: 10 }}
          />
          {!q && (
            <div style={{ display: "flex", gap: 4, marginBottom: 10, flexWrap: "wrap" }}>
              {EMOJI_CATS.map((c, i) => (
                <button key={c.name} type="button" title={c.name}
                  onClick={() => { setActiveCat(i); setSearch(""); }}
                  style={{ background: i === activeCat ? "rgba(38,208,124,.12)" : "var(--panel2)",
                    border: `1px solid ${i === activeCat ? "var(--green)" : "var(--line)"}`,
                    borderRadius: 8, padding: "4px 8px", fontSize: 15, cursor: "pointer", lineHeight: 1 }}>
                  {c.icon}
                </button>
              ))}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 2, maxHeight: 240, overflowY: "auto" }}>
            {grid.length ? grid.map((e, i) => (
              <span key={e + i} onClick={() => pick(e)}
                style={{ cursor: "pointer", fontSize: 22, padding: 5, borderRadius: 8, textAlign: "center", transition: ".1s" }}
                onMouseOver={(ev) => { ev.currentTarget.style.background = "var(--panel2)"; ev.currentTarget.style.transform = "scale(1.2)"; }}
                onMouseOut={(ev) => { ev.currentTarget.style.background = "transparent"; ev.currentTarget.style.transform = "scale(1)"; }}>
                {e}
              </span>
            )) : (
              <div style={{ gridColumn: "1/-1", color: "var(--dim)", fontSize: 12, padding: 16, textAlign: "center" }}>
                No matches — try a category.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
