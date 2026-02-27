import mongoose, { Document, Schema } from 'mongoose';

interface IFoodOption {
  _id: mongoose.Types.ObjectId;
  name: string;
  votes: mongoose.Types.ObjectId[];
}

export interface IFoodPoll extends Document {
  hostelBlock: string;
  title: string;
  description?: string;
  foods: IFoodOption[];
  createdBy: mongoose.Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const FoodOptionSchema = new Schema<IFoodOption>(
  {
    name: { type: String, required: true, trim: true },
    votes: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  { _id: true },
);

const FoodPollSchema = new Schema<IFoodPoll>(
  {
    hostelBlock: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    foods: {
      type: [FoodOptionSchema],
      required: true,
      validate: {
        validator: (value: IFoodOption[]) => Array.isArray(value) && value.length > 0,
        message: 'At least one food item is required',
      },
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  {
    timestamps: true,
  },
);

FoodPollSchema.index({ hostelBlock: 1, createdAt: -1 });

export default mongoose.models.FoodPoll || mongoose.model<IFoodPoll>('FoodPoll', FoodPollSchema);