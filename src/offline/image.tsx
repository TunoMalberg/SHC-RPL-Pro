/**
 * Ersatz für next/image in der Offline-Datei: Bilder kommen eingebettet
 * aus __RPL_ASSETS__ statt vom Server.
 */
import type { ImgHTMLAttributes } from "react";
import { offlineAssets } from "./offlineApi";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string;
  priority?: boolean;
};

export default function Image({ src, priority: _priority, alt, ...rest }: Props) {
  return <img src={offlineAssets()[src] ?? src} alt={alt} {...rest} />;
}
