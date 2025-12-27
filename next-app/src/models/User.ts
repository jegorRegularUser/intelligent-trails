import mongoose from 'mongoose'

export interface IUser {
  email: string
  passwordHash: string
  createdAt: Date
  updatedAt: Date
}

const UserSchema = new mongoose.Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
)

// Индекс для быстрого поиска по email
UserSchema.index({ email: 1 })

export const User =
  mongoose.models.User || mongoose.model<IUser>('User', UserSchema)
