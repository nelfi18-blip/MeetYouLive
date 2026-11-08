// Real 360-degree equirectangular street panoramas, NOT generated geometry.
// Both are distinct camera positions in the SAME Mapillary sequence on
// 2026-02-25. Position changes switch photographs; they do not simulate a
// continuous physical walk or reveal members' GPS coordinates.
// Wikimedia Commons files: CC BY-SA 4.0, author jlin4529 (credit required).
const commonsFile = (name) => "https://commons.wikimedia.org/wiki/File:" + encodeURIComponent(name).replace(/%20/g, "_");
const commonsImage = (name) => "https://commons.wikimedia.org/wiki/Special:FilePath/" +
  encodeURIComponent(name) + "?width=2048";

export const WORLD_REAL_PANORAMAS = Object.freeze({
  us: Object.freeze([
    {
        id: "manhattan-north",
        file: "Mapillary (jlin4529) 2026-02-25 16H09M48S059 (1499844461480054 at BmbuVUw0OQoj159sYyMFG2 with GoPro MAX2).jpg",
        lat: 40.734924,
        lon: -73.982912
    },
    {
        id: "manhattan-south",
        file: "Mapillary (jlin4529) 2026-02-25 16H09M52S397 (1665049991211239 at BmbuVUw0OQoj159sYyMFG2 with GoPro MAX2).jpg",
        lat: 40.732896,
        lon: -73.984482
    }
].map((record) => Object.freeze({
    ...record,
    author: "jlin4529",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl: commonsFile(record.file),
    imageUrl: commonsImage(record.file),
  }))),
});
export const getWorldPanoramaStops = (country) => WORLD_REAL_PANORAMAS[country] || null;
