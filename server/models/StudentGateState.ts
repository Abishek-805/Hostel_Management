import mongoose, { Document, Schema, Types } from 'mongoose';

export type StudentGatePosition = 'OUTSIDE_CAMPUS' | 'INSIDE_CAMPUS' | 'INSIDE_HOSTEL';

export interface IStudentGateState extends Document {
  userId: Types.ObjectId;
  currentState: StudentGatePosition;
  attendanceLocked: boolean;
  lastExitTime?: Date;
  lastCampusEntryTime?: Date;
  lastHostelEntryTime?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const StudentGateStateSchema = new Schema<IStudentGateState>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    currentState: {
      type: String,
      enum: ['OUTSIDE_CAMPUS', 'INSIDE_CAMPUS', 'INSIDE_HOSTEL'],
      default: 'INSIDE_HOSTEL',
      required: true,
    },
    attendanceLocked: {
      type: Boolean,
      default: false,
      required: true,
    },
    lastExitTime: { type: Date },
    lastCampusEntryTime: { type: Date },
    lastHostelEntryTime: { type: Date },
  },
  {
    timestamps: true,
  }
);

export default mongoose.models.StudentGateState ||
  mongoose.model<IStudentGateState>('StudentGateState', StudentGateStateSchema);
