import mongoose, { Document, Schema } from 'mongoose';

export interface IGateConfig extends Document {
  gateNumber: number;
  gateCode: string;
  assigned: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const GateConfigSchema = new Schema<IGateConfig>(
  {
    gateNumber: {
      type: Number,
      required: true,
      unique: true,
      min: 1,
      max: 11,
      index: true,
    },
    gateCode: {
      type: String,
      required: true,
      trim: true,
    },
    assigned: {
      type: Boolean,
      default: false,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.models.GateConfig || mongoose.model<IGateConfig>('GateConfig', GateConfigSchema);
