// 지도에서 청사진에 담기 · 빼기를 저장한 뒤 보내는 브라우저 이벤트(P-12h U1): 메뉴 배지(app/nav/cart-badge)가 듣고 다시 센다.
export const CART_EVENT = "blueprint-cart-change";
export const cartChanged = (): void => { window.dispatchEvent(new Event(CART_EVENT)); };
