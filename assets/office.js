import { floors, people } from "./data.js";

const building = document.querySelector("#building");
const floorButtons = document.querySelector("#floors");
const roster = document.querySelector("#roster");
const card = document.querySelector("#card");
const title = document.querySelector("#floor-title");

let activeFloor = 1;
let activeId = "02";

const slots = {
  1: [18, 28, 46, 62],
  2: [22, 40, 58],
  3: [24, 46, 64],
  4: [20, 42, 60],
  5: [8, 20, 32, 44, 56, 68, 78, 88],
  6: [10, 22, 34, 46, 58, 70, 82],
  7: [34],
};

function face() {
  return `<circle cx="18" cy="14" r="7" fill="#f3d2b5"/><circle cx="16" cy="14" r="1" fill="#2c241c"/><circle cx="20" cy="14" r="1" fill="#2c241c"/>`;
}
function hair(kind) {
  if (kind === "short") return `<path d="M11 12c1-5 13-5 14 0v2H11z" fill="#2c241c"/>`;
  if (kind === "side") return `<path d="M11 13c1-6 14-6 14 1v2H11z" fill="#3a2a22"/>`;
  if (kind === "bob") return `<path d="M11 12c0-6 14-6 14 1v7h-3v-4H14v4h-3z" fill="#2f3d55"/>`;
  if (kind === "bun") return `<circle cx="18" cy="6" r="3" fill="#6b4a32"/><path d="M12 12c1-4 11-4 12 0v2H12z" fill="#6b4a32"/>`;
  if (kind === "puff") return `<circle cx="18" cy="7" r="4" fill="#2c241c"/><path d="M12 13c1-3 11-3 12 0v1H12z" fill="#2c241c"/>`;
  return `<path d="M11 13c2-6 14-5 14 1v3H11z" fill="#5a3b28"/>`;
}
function cloth(outfit) {
  const map = { suit: "#3c424a", blazer: "#243e6b", kit: "#1d1d1d", apron: "#c4784a", coat: "#c9c3ba", engineer: "#3d628c" };
  return map[outfit] || "#243e6b";
}
function person(p) {
  if (p.bot) {
    return `<svg viewBox="0 0 36 62"><rect x="10" y="16" width="16" height="14" rx="3" fill="#d9dde2"/><circle cx="15" cy="22" r="1.4" fill="#7ec8e3"/><circle cx="21" cy="22" r="1.4" fill="#7ec8e3"/><rect x="12" y="32" width="12" height="14" rx="2" fill="#8d949c"/><rect x="8" y="48" width="6" height="8" fill="#6d747c"/><rect x="22" y="48" width="6" height="8" fill="#6d747c"/></svg>`;
  }
  const glow = p.accessory === "glow" ? `<circle cx="18" cy="20" r="15" fill="none" stroke="#7ec8e3" stroke-width="1.4"/>` : "";
  const glasses = p.accessory === "glasses" ? `<rect x="13" y="12" width="5" height="3" fill="none" stroke="#2c241c"/><rect x="19" y="12" width="5" height="3" fill="none" stroke="#2c241c"/>` : "";
  const tag = p.accessory === "tag" ? `<rect x="20" y="28" width="5" height="3" fill="#c6a15a"/>` : "";
  const tablet = p.accessory === "tablet" ? `<rect x="22" y="34" width="8" height="6" rx="1" fill="#2c241c"/>` : "";
  const camera = p.accessory === "camera" ? `<rect x="14" y="33" width="8" height="5" rx="1" fill="#222"/>` : "";
  const ear = p.accessory === "earpiece" ? `<circle cx="24" cy="15" r="1.4" fill="#222"/>` : "";
  return `<svg viewBox="0 0 36 62">${glow}${face()}${hair(p.hair)}<path d="M12 24h12v16H12z" fill="${cloth(p.outfit)}"/>${tag}<rect x="11" y="40" width="5" height="14" fill="#2f3540"/><rect x="20" y="40" width="5" height="14" fill="#2f3540"/>${tablet}${camera}${glasses}${ear}</svg>`;
}

function props(floor) {
  if (floor.id === 1) return `<div class="counter"></div>`;
  if (floor.id === 2) return `<div class="lane"></div>`;
  if (floor.id === 3) return `<div class="desk" style="left:24px"></div><div class="desk" style="right:20px"></div>`;
  if (floor.id === 4) return `<div class="camera"></div><div class="board"></div>`;
  if (floor.id === 5) return `<div class="desk" style="left:20px"></div><div class="desk" style="left:120px"></div>`;
  if (floor.id === 6) return `<div class="rack" style="left:16px"></div><div class="rack" style="left:42px"></div><div class="rack" style="left:68px"></div>`;
  return `<div class="table"></div>`;
}

function render() {
  building.innerHTML = "";
  floors.forEach((floor) => {
    const slice = document.createElement("article");
    slice.className = "slice" + (floor.id === activeFloor ? " on" : "");
    slice.innerHTML = `<div class="room">${props(floor)}<div class="label">L${floor.id} ${floor.name}</div></div><div class="shaft">${floor.id === activeFloor ? `<div class="car"></div>` : ""}</div><div class="room"></div>`;
    const crew = people.filter((p) => p.floor === floor.id);
    crew.forEach((p, i) => {
      const btn = document.createElement("button");
      btn.className = (p.bot ? "bot" : "person") + (p.id === activeId ? " on" : "");
      btn.style.left = `${slots[floor.id][i] || 20 + i * 12}%`;
      btn.innerHTML = person(p);
      btn.title = p.name;
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        activeId = p.id;
        activeFloor = p.floor;
        render();
      });
      slice.querySelector(".room").appendChild(btn);
    });
    slice.addEventListener("click", () => {
      activeFloor = floor.id;
      activeId = crew[0]?.id || activeId;
      render();
    });
    building.appendChild(slice);
  });

  floorButtons.innerHTML = "";
  floors.forEach((floor) => {
    const btn = document.createElement("button");
    btn.textContent = `L${floor.id}`;
    btn.className = floor.id === activeFloor ? "on" : "";
    btn.addEventListener("click", () => {
      activeFloor = floor.id;
      render();
    });
    floorButtons.appendChild(btn);
  });

  const shown = people.filter((p) => p.floor === activeFloor);
  const floor = floors.find((f) => f.id === activeFloor);
  title.textContent = `Lantai ${floor.id} · ${floor.wing}`;
  roster.innerHTML = "";
  shown.forEach((p) => {
    const btn = document.createElement("button");
    btn.className = p.id === activeId ? "on" : "";
    btn.innerHTML = `<span>${p.id} ${p.name}</span><span class="tag">${p.type}</span>`;
    btn.addEventListener("click", () => {
      activeId = p.id;
      render();
    });
    roster.appendChild(btn);
  });
  const picked = people.find((p) => p.id === activeId);
  card.innerHTML = `<b>${picked.id} ${picked.name}</b><span>${picked.type} · lantai ${picked.floor}</span><p>${picked.task}</p>`;
}

render();
