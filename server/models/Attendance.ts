import mongoose, { Document, Schema } from 'mongoose';

export interface IAttendance extends Document {
  userId: mongoose.Types.ObjectId;
  date: Date;
  isPresent: boolean;
  photoUrl?: string;
  latitude?: string;
  longitude?: string;
  markedAt: Date;
  reason?: string;
  status: 'present' | 'absent' | 'leave' | 'holiday';
  session: 'morning' | 'afternoon';
}

const AttendanceSchema: Schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, required: true },
  isPresent: { type: Boolean, default: true },
  photoUrl: { type: String },
  latitude: { type: String },
  longitude: { type: String },
  markedAt: { type: Date, default: Date.now },
  reason: { type: String },
  status: {
    type: String,
    enum: ['present', 'absent', 'leave', 'holiday'],
    default: 'present'
  },
  session: {
    type: String,
    enum: ['morning', 'afternoon'],
    required: true
  }
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance optimization
AttendanceSchema.index({ userId: 1, date: 1 });
AttendanceSchema.index({ userId: 1 });
AttendanceSchema.index({ date: 1 });
AttendanceSchema.index({ userId: 1, date: -1 });

export default mongoose.models.Attendance || mongoose.model<IAttendance>('Attendance', AttendanceSchema);