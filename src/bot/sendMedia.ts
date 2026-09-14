import { InputFile } from "grammy";
import type { Context } from "grammy";
import {
  collectTradePhotos,
  downloadFile,
  getTradeDetail,
  loadProtocolResult,
} from "../etp/client.js";
import { formatMoney } from "../etp/format.js";
import { formatCompletedCard, formatTradeCard, formatTradeDetail } from "../etp/messages.js";
import type { TradeDetail, TradeListItem } from "../etp/types.js";

const htmlOpts = { parse_mode: "HTML" as const, link_preview_options: { is_disabled: true } };

export async function sendPhotoAlbum(
  ctx: Context,
  photos: Array<{ name: string; href: string }>,
): Promise<void> {
  if (photos.length === 0) return;

  const downloaded = await Promise.all(
    photos.slice(0, 10).map(async (photo) => {
      try {
        const file = await downloadFile(photo.href, photo.name);
        return { photo, file };
      } catch (error) {
        console.error("photo download failed", photo.href, error);
        return null;
      }
    }),
  );

  const images = downloaded.flatMap((row) => {
    if (!row) return [];
    if (row.file.buffer.length > 9.5 * 1024 * 1024) return [];
    const imageLike =
      row.file.contentType.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp)$/i.test(row.photo.name);
    return imageLike ? [row] : [];
  });

  if (images.length === 0) return;

  try {
    if (images.length === 1) {
      const only = images[0]!;
      await ctx.replyWithPhoto(new InputFile(only.file.buffer, only.photo.name));
      return;
    }
    await ctx.replyWithMediaGroup(
      images.map((row) => ({
        type: "photo" as const,
        media: new InputFile(row.file.buffer, row.photo.name),
      })),
    );
  } catch (error) {
    console.error("photo album failed, sending one by one", error);
    for (const row of images.slice(0, 4)) {
      try {
        await ctx.replyWithPhoto(new InputFile(row.file.buffer, row.photo.name));
      } catch (inner) {
        console.error("single photo failed", inner);
      }
    }
  }
}

export async function sendTradePreview(ctx: Context, item: TradeListItem): Promise<void> {
  let photos = collectTradePhotos(item);
  if (photos.length === 0) {
    try {
      const detail = await getTradeDetail(item.id);
      photos = collectTradePhotos(item, detail);
    } catch (error) {
      console.error("detail for photos failed", item.id, error);
    }
  }
  await sendPhotoAlbum(ctx, photos);
  await ctx.reply(formatTradeCard(item), htmlOpts);
}

export async function sendTradeDetailView(ctx: Context, detail: TradeDetail): Promise<void> {
  await sendPhotoAlbum(ctx, collectTradePhotos(undefined, detail));
  const protocol = await loadProtocolResult(detail).catch((error) => {
    console.error("protocol load failed", detail.id, error);
    return null;
  });
  await ctx.reply(formatTradeDetail(detail, protocol), htmlOpts);
  if (protocol?.file) {
    const caption =
      protocol.salePrice != null
        ? `Выписка: ушла за ${formatMoney(protocol.salePrice)}`
        : "Выписка из протокола итогов";
    await ctx.replyWithDocument(new InputFile(protocol.file.buffer, protocol.file.name), { caption });
  }
}

export async function sendCompletedTrade(ctx: Context, item: TradeListItem): Promise<void> {
  await ctx.replyWithChatAction("upload_photo");
  const detail = await getTradeDetail(item.id);
  const protocol = await loadProtocolResult(detail).catch((error) => {
    console.error("protocol load failed", item.id, error);
    return null;
  });

  await sendPhotoAlbum(ctx, collectTradePhotos(item, detail));
  await ctx.reply(formatCompletedCard(item, detail, protocol), htmlOpts);

  if (!protocol?.file) {
    await ctx.reply("Выписку из протокола итогов на этой карточке не нашёл.");
    return;
  }

  const caption =
    protocol.salePrice != null
      ? `Выписка: ушла за ${formatMoney(protocol.salePrice)}`
      : "Выписка из протокола итогов";
  await ctx.replyWithDocument(new InputFile(protocol.file.buffer, protocol.file.name), { caption });
}
