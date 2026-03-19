const { MongoClient } = require('mongodb');

const url = 'mongodb+srv://admin:admin@cluster0.ndbz4pp.mongodb.net/?appName=Cluster0'; // Replace with your Atlas URI in production
const client = new MongoClient(url);

let db;

async function connectDB() {
  if (db) return db;
  await client.connect();
  console.log("🚀 Connected successfully to MongoDB");
  db = client.db('MiaFilmia_automation'); 
  return db;
}

module.exports = { connectDB };