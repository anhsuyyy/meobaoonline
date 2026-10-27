import { NRO_ART_PACK_ITEMS, NRO_GENERATED_ITEMS } from '../../generated/nroArtPackManifest';

export function getNroItemIcon(itemId) {
    return NRO_ART_PACK_ITEMS[Number(itemId)] || NRO_GENERATED_ITEMS[Number(itemId)] || `/assets/nro/items/khac/item-${Number(itemId)}.svg`;
}
