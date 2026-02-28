import mongoose from 'mongoose';
import dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const OLD_URI = "mongodb+srv://myhostel:23-Sep-06@notes.egwneyv.mongodb.net/test?appName=notes";
const NEW_URI = "mongodb+srv://myhostel:23-Sep-06@notes.egwneyv.mongodb.net/hostelease?appName=notes";

async function migrate() {
    console.log('Starting migration...');

    // Connect to source
    const sourceConn = await mongoose.createConnection(OLD_URI).asPromise();
    console.log('Connected to source (test)');

    // Connect to dest
    const destConn = await mongoose.createConnection(NEW_URI).asPromise();
    console.log('Connected to destination (hostelease)');

    if (!sourceConn.db || !destConn.db) {
        throw new Error('Failed to initialize source/destination database handles');
    }

    const collections = ['users', 'attendances', 'leaverequests', 'complaints', 'messmenus', 'announcements', 'rooms'];

    for (const colName of collections) {
        const sourceCol = sourceConn.db.collection(colName);
        const data = await sourceCol.find().toArray();

        if (data.length > 0) {
            console.log(`Migrating ${data.length} items from ${colName}...`);
            const destCol = destConn.db.collection(colName);

            for (const item of data) {
                await destCol.replaceOne({ _id: item._id }, item, { upsert: true });
            }
        }
    }

    console.log('Migration complete!');
    await sourceConn.close();
    await destConn.close();
}

migrate().catch(console.error);
