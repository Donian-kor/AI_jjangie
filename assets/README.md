# 말·보드 이미지 자산

게임에 쓰는 말·보드 이미지는 외부 저장소에서 가져왔다.

## 출처

**Kadagaden/chess-pieces** — Chess, Janggi, Xiangqi, Sittuyin pieces and boards
<https://github.com/Kadagaden/chess-pieces>

- 라이선스: **CC-BY-4.0** (저작자 표시 필수)
- 라이선스 전문: `LICENSE-chess-pieces.txt` (= 원본 저장소의 `LICENSE.txt`)
- 가져온 커밋: `b035b0cc6a68e9fb99c872c8fe073c3ae3eba8a0` (2026-05-19)

## 무엇을 가져왔나

| 경로 | 원본 | 용도 |
| --- | --- | --- |
| `boards/JanggiOrange.svg` | `boards/JanggiOrange.svg` | 보드 — 오렌지 |
| `boards/JanggiWood.svg` | `boards/JanggiWood.svg` | 보드 — 나무 |
| `boards/JanggiWoodDark.svg` | `boards/JanggiWoodDark.svg` | 보드 — 짙은 나무 |
| `boards/JanggiBrown.svg` | `boards/JanggiBrown.svg` | 보드 — 갈색 |
| `boards/JanggiStone.svg` | `boards/JanggiStone.svg` | 보드 — 돌 |
| `pieces/red_*.svg`, `pieces/blue_*.svg` | `janggi_wooden/` | 말 — 목재 디자인 (색이 이미지에 박혀 있음) |
| `pieces-kakao.js` | `janggi_kakao_janggi_style_white/` | 말 — 카카오 디자인 (아래 참조) |

`pieces-kakao.js` 는 **원본 SVG 를 JS 문자열로 내장한 자동 생성 파일**이다. 원본 SVG 는 92×92 `viewBox` 이고 글자 색이 `#e12810`(장) 또는 `#e1220a`(왕)로 박혀 있는데, 생성 과정에서 그 색만 `%COLOR%` 로 바꿔 넣었다. 실행 시 이 자리표시자를 원하는 색으로 치환해 `data:` URI 로 그린다.

## 왜 SVG 를 JS 에 내장했나

`file://` 로 열면 브라우저가 `fetch()` 를 막는다. `<img>` 로 그린 SVG 는 색을 바꿀 수 없어서, 원본 문자열을 미리 가지고 있어야 실행 중 색을 바꿔 그릴 수 있다. 보드·목재 말처럼 색을 바꿀 필요 없는 이미지는 파일로 두었다.

## 다시 만들기

저장소를 받아 두고 아래를 실행한다.

```powershell
git clone --depth 1 https://github.com/Kadagaden/chess-pieces.git $env:TEMP\opencode\chess-pieces

# 보드·목재 말 복사 (CC-BY-4.0)
Copy-Item "$env:TEMP\opencode\chess-pieces\boards\Janggi*.svg" assets\boards\ -Force
Copy-Item "$env:TEMP\opencode\chess-pieces\janggi_wooden\*.svg" assets\pieces\ -Force
Copy-Item "$env:TEMP\opencode\chess-pieces\LICENSE.txt" assets\LICENSE-chess-pieces.txt -Force

# 카카오 말(색 변경 가능한 버전) 생성
node tools\make-piece-assets.js "$env:TEMP\opencode\chess-pieces"
```

`tools/make-piece-assets.js` 는 기물 7종만 다룬다. 저장소에 새 기물이 생기면 `PIECES` 배열에 추가하고 다시 실행한다.

## 보드 정렬

보드 SVG 는 전부 `viewBox="0 0 900 1000"` (= 9열 × 10행) 이고, 상하좌우 50 여백 + 한 칸 100 단위다. 게임 쪽 여백(`pad`)을 한 칸의 정확히 0.5배로 잡으면 이미지 격자와 겹친다. (`index.html` 의 `layout()` 참조)

`pad` 가 정수 반올림되므로, `cell` 이 홀수면 끝 열이 최대 0.5px 어긋난다. 눈에 띄지 않는 수준이다.

## 라이선스 요건

CC-BY-4.0 은 저작자 표시를 요구한다. `index.html` 하단 footer 에 다음을 넣었다.

```
말·보드 이미지: Kadagaden/chess-pieces (CC-BY-4.0) · 라이선스 전문: assets/LICENSE-chess-pieces.txt
```

파일을 다시 배포할 때 이 문구를 유지하거나 동등한 고지를 반드시 남겨야 한다.