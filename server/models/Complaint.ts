import mongoose, { Document, Schema } from 'mongoose';

export interface IComplaint extends Document {
  userId: mongoose.Types.ObjectId;
  hostelBlock: string;
  category: 'water' | 'electricity' | 'cleaning' | 'food' | 'others';
  description: string;
  photoUrl?: string;
  isAnonymous: boolean;
  status: 'submitted' | 'in_progress' | 'resolved';
  adminRemarks?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ComplaintSchema: Schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  hostelBlock: { type: String, required: true },
  category: { type: String, enum: ['water', 'electricity', 'cleaning', 'food', 'others'], required: true },
  description: { type: String, required: true },
  photoUrl: { type: String },
  isAnonymous: { type: Boolean, default: false },
  status: { type: String, enum: ['submitted', 'in_progress', 'resolved'], default: 'submitted' },
  adminRemarks: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Indexes for performance optimization
ComplaintSchema.index({ userId: 1 });
ComplaintSchema.index({ hostelBlock: 1 });
ComplaintSchema.index({ status: 1 });
ComplaintSchema.index({ createdAt: -1 });

export default mongoose.models.Complaint || mongoose.model<IComplaint>('Complaint', ComplaintSchema);
