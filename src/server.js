const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;
const USER_COLLECTION = process.env.USER_COLLECTION || "users";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 50;

/// SCHEMA
const UserSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, "Ten khong duoc de trong"],
        minLength: [2, "Ten phai co it nhat 2 ky tu"],
        trim: true
    },
    age: {
        type: Number,
        required: [true, "Tuoi khong duoc de trong"],
        min: [0, "Tuoi phai >= 0"],
        validate: {
            validator: Number.isInteger,
            message: "Tuoi phai la so nguyen"
        }
    },
    email: {
        type: String,
        required: [true, "Email khong duoc de trong"],
        match: [/^\S+@\S+\.\S+$/, "Email khong hop le"],
        trim: true,
        lowercase: true,
        unique: true
    },
    address: {
        type: String,
        trim: true
    }
});

const User = mongoose.model("User", UserSchema, USER_COLLECTION);

/// APP
const app = express();
app.use(cors());
app.use(express.json());

function normalizeAndValidatePayload(payload, { partial = false } = {}) {
    const output = {};

    if (payload.name !== undefined) {
        output.name = String(payload.name).trim();
    }
    if (payload.email !== undefined) {
        output.email = String(payload.email).trim().toLowerCase();
    }
    if (payload.address !== undefined) {
        output.address = String(payload.address).trim();
    }
    if (payload.age !== undefined) {
        const parsedAge = Number(payload.age);
        if (!Number.isInteger(parsedAge)) {
            return { error: "Tuoi phai la so nguyen" };
        }
        output.age = parsedAge;
    }

    if (!partial) {
        if (!output.name || output.name.length < 2) {
            return { error: "Ten phai co it nhat 2 ky tu" };
        }
        if (!Number.isInteger(output.age) || output.age < 0) {
            return { error: "Tuoi phai la so nguyen >= 0" };
        }
        if (!output.email || !/^\S+@\S+\.\S+$/.test(output.email)) {
            return { error: "Email khong hop le" };
        }
    }

    if (partial && Object.keys(output).length === 0) {
        return { error: "Khong co du lieu de cap nhat" };
    }

    return { data: output };
}

/// ROUTE
app.get("/api/users", async (req, res) => {
    try {
        const rawPage = parseInt(req.query.page, 10);
        const rawLimit = parseInt(req.query.limit, 10);

        const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : DEFAULT_PAGE;
        const limitCandidate = Number.isInteger(rawLimit) && rawLimit > 0 ? rawLimit : DEFAULT_LIMIT;
        const limit = Math.min(limitCandidate, MAX_LIMIT);
        const search = String(req.query.search || "").trim();

        const filter = search
            ? {
                  $or: [
                      { name: { $regex: search, $options: "i" } },
                      { email: { $regex: search, $options: "i" } },
                      { address: { $regex: search, $options: "i" } }
                  ]
              }
            : {};

        const skip = (page - 1) * limit;
        const [users, total] = await Promise.all([
            User.find(filter).skip(skip).limit(limit),
            User.countDocuments(filter)
        ]);

        const totalPages = Math.ceil(total / limit);
        res.json({
            page,
            limit,
            total,
            totalPages,
            data: users
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post("/api/users", async (req, res) => {
    try {
        const normalized = normalizeAndValidatePayload(req.body, { partial: false });
        if (normalized.error) {
            return res.status(400).json({ error: normalized.error });
        }

        const newUser = await User.create(normalized.data);
        res.status(201).json({
            message: "Tao nguoi dung thanh cong",
            data: newUser
        });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ error: "Email da ton tai" });
        }
        return res.status(400).json({ error: err.message });
    }
});

app.put("/api/users/:id", async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: "ID khong hop le" });
        }

        const normalized = normalizeAndValidatePayload(req.body, { partial: true });
        if (normalized.error) {
            return res.status(400).json({ error: normalized.error });
        }

        const updatedUser = await User.findByIdAndUpdate(
            id,
            { $set: normalized.data },
            { new: true, runValidators: true }
        );

        if (!updatedUser) {
            return res.status(404).json({ error: "Khong tim thay nguoi dung" });
        }

        return res.json({
            message: "Cap nhat nguoi dung thanh cong",
            data: updatedUser
        });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ error: "Email da ton tai" });
        }
        return res.status(500).json({ error: err.message });
    }
});

app.delete("/api/users/:id", async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: "ID khong hop le" });
        }

        const deletedUser = await User.findByIdAndDelete(id);
        if (!deletedUser) {
            return res.status(404).json({ error: "Khong tim thay nguoi dung" });
        }

        return res.json({ message: "Xoa nguoi dung thanh cong" });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

mongoose
    .connect(MONGO_URI)
    .then(() => {
        console.log("Connected to MongoDB");
        app.listen(3001, () => console.log("API running on port 3001"));
    })
    .catch((err) => {
        console.log("Connection error: ", err);
        process.exit(1);
    });
