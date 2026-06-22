import mongoose, { Document, Schema, Types } from 'mongoose';

export type NotificationType =
  | 'LATE_RETURN'
  | 'CURFEW_VIOLATION'
  | 'GATE_ALERT'
  | 'SYSTEM'
  | 'PASS_APPROVED'
  | 'PASS_REJECTED'
  | 'EXTENSION_APPROVED'
  | 'EXTENSION_REJECTED';

export interface INotification extends Document {
  recipientId: Types.ObjectId;        // admin who should see it
  studentId: Types.ObjectId;          // student concerned
  gatePassId: string;                 // gate pass ID string
  type: NotificationType;
  title: string;
  message: string;
  details: {
    studentName?: string;
    registerId?: string;
    hostelBlock?: string;
    roomNumber?: string;
    exitTime?: Date;
    entryTime?: Date;
    expectedReturnTime?: Date;
    lateDurationMinutes?: number;
    destination?: string;
    rejectionReason?: string;
    approvedReturnTime?: Date;
    extensionRequestedReturnTime?: Date;
  };
  read: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    recipientId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    studentId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    gatePassId: {
      type: String,
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        'LATE_RETURN',
        'CURFEW_VIOLATION',
        'GATE_ALERT',
        'SYSTEM',
        'PASS_APPROVED',
        'PASS_REJECTED',
        'EXTENSION_APPROVED',
        'EXTENSION_REJECTED',
      ],
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    details: {
      studentName: String,
      registerId: String,
      hostelBlock: String,
      roomNumber: String,
      exitTime: Date,
      entryTime: Date,
      expectedReturnTime: Date,
      lateDurationMinutes: Number,
      destination: String,
      rejectionReason: String,
      approvedReturnTime: Date,
      extensionRequestedReturnTime: Date,
    },
    read: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to prevent duplicate notifications for same pass+type
NotificationSchema.index(
  { gatePassId: 1, type: 1, recipientId: 1 },
  { unique: true }
);

// Index for efficient queries: unread notifications for a recipient
NotificationSchema.index({ recipientId: 1, read: 1, createdAt: -1 });

export default mongoose.models.Notification ||
  mongoose.model<INotification>('Notification', NotificationSchema);
