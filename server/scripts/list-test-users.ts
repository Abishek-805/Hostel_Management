import mongoose from 'mongoose';
import dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

// Use the OLD connection string that pointed to 'test'
const MONGODB_URI = "mongodb+srv://myhostel:23-Sep-06@notes.egwneyv.mongodb.net/?appName=notes";

async function checkOldDb() {
    await mongoose.connect(MONGODB_URI);
    const db = mongoose.connection.db;
    if (!db) {
        throw new Error('Database connection is not available');
    }
    const users = await db.collection('users').find().toArray();
    console.log('--- USERS IN TEST DATABASE ---');
    users.forEach(u => console.log(` - ID: ${u.registerId}, Name: ${u.name}`));
    await mongoose.disconnect();
}

checkOldDb().catch(console.error);
