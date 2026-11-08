// Карта плотности населения по странам (средняя плотность, чел./км², 2024 г., приблизительно).
// Рисуется с помощью d3 + topojson (подключены в index.html), границы стран — world-atlas.

const DENSITY = {
  "004":65,"008":98,"012":19,"024":30,"032":17,"051":100,"036":3.5,"040":110,"031":122,"044":41,"050":1169,
  "112":45,"056":390,"084":18,"204":120,"064":20.5,"068":11,"070":63,"072":4.5,"076":25,"096":87,"100":59,
  "854":85,"108":520,"116":98,"120":60,"124":4,"140":9,"148":15,"152":26,"156":148,"170":46,"178":18,"180":46,
  "188":100,"384":98,"191":68,"192":105,"196":136,"203":139,"208":140,"262":50,"214":235,"218":72,"818":112,
  "222":300,"226":68,"232":30,"233":31,"748":70,"231":120,"238":0.3,"242":50,"246":18,"250":120,"266":9,
  "270":260,"268":53,"276":237,"288":145,"300":80,"304":0.03,"320":165,"324":58,"624":75,"328":4,"332":420,
  "340":95,"348":105,"352":3.9,"356":441,"360":150,"364":55,"368":105,"372":75,"376":450,"380":196,"388":260,
  "392":328,"400":128,"398":7.3,"404":98,"408":215,"410":515,"414":270,"417":37,"418":33,"428":29,"422":560,
  "426":76,"430":57,"434":4,"440":44,"442":255,"807":72,"450":54,"454":220,"458":105,"466":19,"478":5,"484":66,
  "498":72,"496":2.2,"499":46,"504":85,"732":2.3,"508":43,"104":83,"516":3.6,"524":210,"528":431,"540":15,
  "554":19.4,"558":58,"562":21,"566":252,"578":15,"512":17,"586":315,"275":900,"591":60,"598":22,"600":17,
  "604":27,"608":380,"616":120,"620":115,"630":360,"634":260,"642":80,"643":8.5,"646":560,"682":17,"686":95,
  "688":85,"694":120,"703":112,"705":105,"090":27,"706":30,"710":52,"728":18,"724":96,"144":350,"729":28,
  "740":4,"752":26,"756":225,"760":125,"158":650,"762":75,"834":75,"764":140,"626":92,"768":170,"780":290,
  "788":80,"792":110,"795":15,"800":240,"804":65,"784":140,"826":280,"840":37,"858":19.5,"860":82,"548":27,
  "862":32,"704":320,"887":75,"894":28,"716":43,"010":0,"260":0,
};
const BY_NAME = { "Kosovo": 160, "N. Cyprus": 110, "Somaliland": 30 };

export const CAT_COLORS = { I: "#8a5a2b", II: "#c9a273", III: "#f1d75a", IV: "#ffffff", none: "#e6e6e6" };
function cat(d) {
  if (d == null) return "none";
  if (d > 100) return "I"; if (d > 20) return "II"; if (d > 2) return "III"; return "IV";
}

let worldPromise = null;
function loadWorld() {
  if (!worldPromise) {
    worldPromise = fetch("https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json")
      .then((r) => { if (!r.ok) throw new Error("map"); return r.json(); });
  }
  return worldPromise;
}

// markers: [{letter, iso, lat, lon}]
export async function drawMap(container, markers) {
  container.innerHTML = '<div class="map-loading">Загрузка карты…</div>';
  let world;
  try { world = await loadWorld(); }
  catch (e) {
    container.innerHTML = '<div class="map-loading">Не удалось загрузить карту. Проверьте интернет и обновите страницу.</div>';
    return;
  }
  const d3 = window.d3, topojson = window.topojson;
  const countries = topojson.feature(world, world.objects.countries).features
    .filter((f) => f.properties.name !== "Antarctica");
  const W = 960, H = 470;
  const projection = d3.geoNaturalEarth1().fitExtent([[6, 6], [W - 6, H - 6]], { type: "Sphere" });
  const path = d3.geoPath(projection);
  const marked = new Set(markers.map((m) => m.iso));

  const svg = d3.create("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("class", "density-map")
    .attr("role", "img").attr("aria-label", "Карта плотности населения");
  svg.append("path").attr("d", path({ type: "Sphere" })).attr("fill", "#dcecf5").attr("stroke", "#9bb6c6");
  svg.append("path").attr("d", path(d3.geoGraticule10())).attr("fill", "none").attr("stroke", "#c3d8e4").attr("stroke-width", 0.5);

  svg.append("g").selectAll("path").data(countries).join("path")
    .attr("d", path)
    .attr("fill", (f) => {
      const id = f.id != null ? String(f.id).padStart(3, "0") : null;
      const d = id && DENSITY[id] != null ? DENSITY[id] : BY_NAME[f.properties.name];
      return CAT_COLORS[cat(d)];
    })
    .attr("stroke", "#7a7a7a").attr("stroke-width", 0.4);

  // выделенные страны
  svg.append("g").selectAll("path")
    .data(countries.filter((f) => f.id != null && marked.has(String(f.id).padStart(3, "0"))))
    .join("path").attr("d", path).attr("fill", "none").attr("stroke", "#c0262d").attr("stroke-width", 2.2);

  const g = svg.append("g");
  for (const m of markers) {
    const [x, y] = projection([m.lon, m.lat]);
    g.append("circle").attr("cx", x).attr("cy", y).attr("r", 12).attr("fill", "#fff").attr("stroke", "#c0262d").attr("stroke-width", 2.5);
    g.append("text").attr("x", x).attr("y", y + 5).attr("text-anchor", "middle")
      .attr("font-size", 15).attr("font-weight", 700).attr("fill", "#c0262d").text(m.letter);
  }

  container.innerHTML = "";
  container.appendChild(svg.node());
  const legend = document.createElement("div");
  legend.className = "map-legend";
  legend.innerHTML = `
    <span><i style="background:${CAT_COLORS.I}"></i>I — более 100 чел./км²</span>
    <span><i style="background:${CAT_COLORS.II}"></i>II — от 20 до 100 чел./км²</span>
    <span><i style="background:${CAT_COLORS.III}"></i>III — от 2 до 20 чел./км²</span>
    <span><i style="background:${CAT_COLORS.IV}"></i>IV — менее 2 чел./км²</span>
    <small>Средняя плотность населения по странам (2024 г., приблизительно)</small>`;
  container.appendChild(legend);
}
