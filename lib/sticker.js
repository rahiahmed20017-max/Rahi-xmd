import webp from "node-webpmux";
import fs from "node:fs";
import ffmpeg from "fluent-ffmpeg";
import { tmpdir } from "node:os";
import crypto from "node:crypto";
import path from "node:path";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

class StickerBuilder {
  constructor() {
    this.tmp = tmpdir();
  }

  _tmp(ext) {
    return path.join(
      this.tmp,
      `${crypto.randomBytes(6).toString("hex")}.${ext}`,
    );
  }

  async _convert(input, output, configure) {
    await new Promise((resolve, reject) => {
      configure(ffmpeg(input))
        .on("error", reject)
        .on("end", resolve)
        .save(output);
    });
    return fs.readFileSync(output);
  }

  async _withTempFiles(files, fn) {
    try {
      return await fn();
    } finally {
      for (const file of files) {
        try {
          fs.unlinkSync(file);
        } catch (error) {
          if (error?.code !== "ENOENT") throw error;
        }
      }
    }
  }

  async toSticker(type, media, exif = null) {
    const ext = type === "image" ? "jpg" : "mp4";
    const input = this._tmp(ext);
    const output = this._tmp("webp");
    fs.writeFileSync(input, media);

    const buffer = await this._withTempFiles([input, output], () =>
      this._convert(input, output, (command) =>
        command
          .addOutputOptions(
            ext === "jpg"
              ? [
                  "-vcodec",
                  "libwebp",
                  "-vf",
                  "scale=320:320:force_original_aspect_ratio=increase,crop=320:320,fps=15",
                ]
              : [
                  "-vcodec",
                  "libwebp",
                  "-vf",
                  "scale=320:320:force_original_aspect_ratio=increase,crop=320:320,fps=15",
                  "-loop",
                  "0",
                  "-ss",
                  "00:00:00",
                  "-t",
                  "00:00:05",
                  "-preset",
                  "default",
                  "-an",
                  "-vsync",
                  "0",
                ],
          )
          .toFormat("webp"),
      ),
    );

    return exif ? this.addExif(buffer, exif) : buffer;
  }

  async circleImage(media) {
    const input = this._tmp("png");
    const output = this._tmp("png");
    fs.writeFileSync(input, media);

    return this._withTempFiles([input, output], () =>
      this._convert(input, output, (command) =>
        command
          .addOutputOptions([
            "-vf",
            "scale=320:320:force_original_aspect_ratio=increase,crop=320:320,format=rgba,geq='if((X-W/2)^2+(Y-H/2)^2>(min(W,H)/2)^2,0,255)':128:128:128",
          ])
          .toFormat("png"),
      ),
    );
  }

  async toCircleSticker(media, exif = null) {
    const circled = await this.circleImage(media);
    const input = this._tmp("png");
    const output = this._tmp("webp");
    fs.writeFileSync(input, circled);

    const buffer = await this._withTempFiles([input, output], () =>
      this._convert(input, output, (command) =>
        command
          .addOutputOptions([
            "-vcodec",
            "libwebp",
            "-vf",
            "scale=320:320:force_original_aspect_ratio=decrease,format=rgba",
          ])
          .toFormat("webp"),
      ),
    );

    return exif ? this.addExif(buffer, exif) : buffer;
  }

  async addExif(webpSticker, info) {
    const img = new webp.Image();
    const { packname, author, categories } = info;
    const json = {
      "sticker-pack-id": crypto.randomBytes(16).toString("hex"),
      "sticker-pack-name": packname || "",
      "sticker-pack-publisher": author || "",
      emojis: categories || ["💖"],
      "android-app-store-link": "https://github.com/nightx-rebel",
      "ios-app-store-link": "https://github.com/nightx-rebel",
    };

    const exifHeader = Buffer.from([
      0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57,
      0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
    ]);
    const jsonBuffer = Buffer.from(JSON.stringify(json), "utf8");
    const exif = Buffer.concat([exifHeader, jsonBuffer]);
    exif.writeUIntLE(jsonBuffer.length, 14, 4);

    await img.load(webpSticker);
    img.exif = exif;
    return img.save(null);
  }

  async getExif(sticker) {
    const img = new webp.Image();
    await img.load(sticker);
    const json = JSON.parse(
      img.exif
        .slice(22)
        .toString()
        .replace("sticker-pack-name", "sticker_pack_name")
        .replace("sticker-pack-publisher", "sticker_pack_publisher"),
    );
    return {
      packname: json.sticker_pack_name,
      author: json.sticker_pack_publisher,
    };
  }

  async toVideo(webpBuffer) {
    const input = this._tmp("webp");
    const output = this._tmp("mp4");
    fs.writeFileSync(input, webpBuffer);

    return this._withTempFiles([input, output], () =>
      this._convert(input, output, (command) =>
        command
          .outputOptions(["-movflags", "faststart", "-pix_fmt", "yuv420p"])
          .toFormat("mp4"),
      ),
    );
  }
}

const stickerBuilder = new StickerBuilder();

export default stickerBuilder;
export { StickerBuilder };
