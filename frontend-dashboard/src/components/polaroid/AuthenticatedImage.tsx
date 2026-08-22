import { useAssetThumbnailUrl, usePersonThumbnailUrl } from '@/hooks/usePolaroid';

interface AssetImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  assetId: string;
  size?: string;
}

export function AssetImage({ assetId, size, alt, ...props }: AssetImageProps) {
  const url = useAssetThumbnailUrl(assetId, size);
  if (!url) {
    return <div className={props.className} style={{ background: 'var(--muted)' }} />;
  }
  return <img src={url} alt={alt} {...props} />;
}

interface PersonImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  personId: string;
}

export function PersonImage({ personId, alt, ...props }: PersonImageProps) {
  const url = usePersonThumbnailUrl(personId);
  if (!url) {
    return <div className={props.className} style={{ background: 'var(--muted)' }} />;
  }
  return <img src={url} alt={alt} {...props} />;
}
