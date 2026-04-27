const mongoose = require("mongoose");

beforeAll(async () => {
  const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/meetyoulive-test";
  await mongoose.connect(uri);
});

afterAll(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].drop().catch(() => {});
  }
  await mongoose.connection.close();
});
