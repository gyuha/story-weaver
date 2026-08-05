---
author: gyuha
decided: 2026-08-05 08:27
---
# Base UI 모달 위에 겹치는 모달은 Base UI `Dialog`로만 띄운다

web에는 모달 시스템이 둘 공존한다 — 스토어 기반 `useModal`(`openModal({ alert, handleOk })`, `work-tree.tsx` 등 5곳 이상에서 쓰는 기존 관례)과 shadcn 계열 Base UI `Dialog`(집필 화면의 요약·진행 모달). task #71에서 요약 모달(Base UI) 위에 대체 확인창을 `useModal`로 띄웠더니 **아래로 깔렸고, z-index로는 고칠 수 없었다**: `Modal.Ground`가 `fixed inset-0 z-50`이라 stacking context를 만들어, 그 자식인 `Modal.Container`의 z-index는 컨텍스트 안에서만 경쟁한다. 바깥에서는 Ground의 50이 Base UI Dialog의 50과 맞서고 Base UI가 body 끝 포털이라 DOM 순서로 이기므로, 확인창에 60을 주든 6000을 주든 올라가지 못한다.

그래서 **Base UI 모달 위에 겹쳐야 하는 모달은 같은 Base UI `Dialog`로 만든다**(공용 `components/ui/confirm-dialog.tsx`). `useModal`은 Base UI 모달과 겹치지 않는 기존 호출부에서 그대로 쓴다 — 전면 통일은 무관한 기능 다수를 건드리므로 별도 작업으로 둔다.

## Considered Options
- **`useModal`에 z-index를 올린다** — 위 이유로 구조적으로 불가능하다. 시도 중 `ModalDefault`가 `zIndex`를 prop으로 선언만 하고 `Modal.Container`에 넘기지 않는 죽은 prop도 발견했지만, 그것을 고쳐도 stacking context가 남아 해결되지 않았다(그 수정은 되돌렸다).
- **`Modal.Ground`의 `z-50`을 걷어낸다** — 모든 기존 모달의 쌓임에 영향이 가고, 배경 클릭 닫기를 담당하는 전면 레이어라 위험 대비 이득이 없다.
- **앱 전체를 한 시스템으로 통일한다** — 옳은 방향이지만 이 작업의 범위를 넘는다. 규칙만 먼저 정한다.

## Consequences
- `useModal`의 `zIndex` prop은 여전히 선언만 되고 무시된다(`modal-default.tsx`). 넘기는 호출부가 없어 지금은 무해하나, 나중에 누가 넘기면 조용히 무시된다.
- 확인창을 실제로 렌더하게 되어 테스트에서 모달 스토어 목이 사라졌다 — 목이 실제 경로를 가리던 문제가 함께 없어졌다.
- **jsdom은 페인팅을 하지 않으므로 "위에 그려진다"는 테스트로 증명할 수 없다.** 테스트가 고정하는 것은 메커니즘(같은 시스템·같은 층·나중 오픈)이고, 쌓임 자체는 브라우저 확인이 필요하다.
