// Real photographs from Wikimedia Commons, with author and license attribution.
// This is a location photograph, NEVER a live feed, GPS position, or AI-generated city.
// Commercial deployment still needs a rights/legal review (notably panorama rights).
const commons = (name) => "https://commons.wikimedia.org/wiki/Special:FilePath/" + encodeURIComponent(name) + "?width=1280";
const source = (name) => "https://commons.wikimedia.org/wiki/File:" + encodeURIComponent(name).replace(/%20/g, "_");
export const WORLD_PHOTO_SCENES = Object.freeze({
  us: {city:"New York",file:"Manhattan, New York skyline.jpg",author:"rboed*",license:"CC BY 2.0",licenseUrl:"https://creativecommons.org/licenses/by/2.0/"},
  fr: {city:"Paris",file:"Eiffel tower from trocadero.jpg",author:"NonOmnisMoriar",license:"CC BY-SA 3.0",licenseUrl:"https://creativecommons.org/licenses/by-sa/3.0/"},
  jp: {city:"Tokyo",file:"Shibuya crossing, Tokyo, Japan.jpg",author:"Joli Rumi",license:"CC BY-SA 4.0",licenseUrl:"https://creativecommons.org/licenses/by-sa/4.0/"},
  ae: {city:"Dubai",file:"Dubai skyline marina.jpg",author:"Wkjekf",license:"CC BY 4.0",licenseUrl:"https://creativecommons.org/licenses/by/4.0/"},
  br: {city:"Rio de Janeiro",file:"Copacabana beach.jpg",author:"Luca Gebara",license:"CC BY-SA 3.0",licenseUrl:"https://creativecommons.org/licenses/by-sa/3.0/"},
  eg: {city:"Giza",file:"The Pyramids of Giza.jpg",author:"Yasseralghol",license:"CC BY-SA 4.0",licenseUrl:"https://creativecommons.org/licenses/by-sa/4.0/"}
});
export const getPhotoScene = (country) => {
  const record = WORLD_PHOTO_SCENES[country] || WORLD_PHOTO_SCENES.us;
  return { ...record, imageUrl: commons(record.file), sourceUrl: source(record.file) };
};
