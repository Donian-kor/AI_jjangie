# build-fsf-wasm.ps1 — Fairy-Stockfish 단일 스레드 WebAssembly 빌드
#
# 왜 이렇게 다시 빌드하나?
#   npm 으로 배포되는 판은 `-s USE_PTHREADS=1` 로 빌드되어 있어 공유 메모리를 요구한다.
#   그러면 일반 정적 서버(파이썬 http.server 등)에서는 SharedArrayBuffer 가 없어
#   엔진이 아예 로드되지 않는다. USE_PTHREADS / PROXY_TO_PTHREAD 를 빼면
#   교차 출처 격리(COOP/COEP) 헤더 없이 어디서나 돌아간다.
#
# 사용법:
#   .\build-fsf-wasm.ps1
#   .\build-fsf-wasm.ps1 -Emsdk 'C:\path\to\emsdk' -OutDir '..\third_party\fairy-stockfish'
param(
  [string]$Emsdk = $env:EMSDK,
  [string]$OutDir = (Join-Path $PSScriptRoot 'third_party\fairy-stockfish'),
  [string]$FsfCommit = 'b2e693ef1e111233ce3fb40685921708b3276ed6',
  [switch]$KeepSource
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$work = Join-Path $env:TEMP ('fsf-build-' + [guid]::NewGuid().ToString('N').Substring(0, 8))

function Say($m) { Write-Host "==> $m" }

# ---------------------------------------------------------------- 1) Emscripten
if (-not $Emsdk -or -not (Test-Path (Join-Path $Emsdk '.emscripten'))) {
  Say 'Emscripten SDK 를 준비합니다 (최초 1회, 수 분 소요)'
  if (-not $Emsdk) { $Emsdk = Join-Path $env:TEMP 'opencode\emsdk' }
  if (-not (Test-Path (Join-Path $Emsdk 'emsdk.py'))) {
    git clone --depth 1 https://github.com/emscripten-core/emsdk.git $Emsdk
  }
  & (Join-Path $Emsdk 'emsdk.bat') install latest
  & (Join-Path $Emsdk 'emsdk.bat') activate latest
}
if (-not $Emsdk) { throw 'emsdk 경로를 지정하세요: -Emsdk <경로>' }

$env:EM_CONFIG  = Join-Path $Emsdk '.emscripten'
$env:EMSDK      = $Emsdk
$nodeDir  = (Get-ChildItem (Join-Path $Emsdk 'node') -Directory | Select-Object -First 1).FullName
$pyDir    = (Get-ChildItem (Join-Path $Emsdk 'python') -Directory | Select-Object -First 1).FullName
$env:Path = "$(Join-Path $Emsdk 'upstream\emscripten');$nodeDir;$pyDir;$env:Path"

# ---------------------------------------------------------------- 2) 빌드 도구 확인
# Makefile 이 uname/expr/grep/sed/cp/curl/sha256sum 을 쓰므로 POSIX 셸이 필요하다.
# Windows 에서는 Git for Windows 의 bash 가 이들을 모두Provide 한다.
$bash = $null
foreach ($c in @(
  (Join-Path $env:ProgramFiles 'Git\bin\bash.exe'),
  (Join-Path ${env:ProgramFiles(x86)} 'Git\bin\bash.exe'),
  'C:\Program Files\Git\usr\bin\bash.exe')) {
  if ($c -and (Test-Path $c)) { $bash = $c; break }
}
if (-not $bash) {
  throw 'Git for Windows(bash.exe)를 찾지 못했습니다. Makefile 빌드에는 POSIX 셸이 필요합니다.'
}

$makeInBash = (Get-Command make -ErrorAction SilentlyContinue).Source
if (-not $makeInBash) {
  $candidate = Join-Path $env:TEMP 'opencode\make-dl\make\bin\make.exe'
  if (Test-Path $candidate) { $makeInBash = $candidate }
  else {
    Say 'make 가 없어 ezwinports 빌드를 내려받습니다'
    $dl = Join-Path $env:TEMP 'opencode\make-dl'
    New-Item -ItemType Directory -Force $dl | Out-Null
    $zip = Join-Path $dl 'make.zip'
    curl.exe -sL --max-time 300 -o $zip `
      'https://sourceforge.net/projects/ezwinports/files/make-4.4.1-without-guile-w32-bin.zip/download'
    Expand-Archive $zip -DestinationPath (Join-Path $dl 'make') -Force
    $makeInBash = (Get-ChildItem (Join-Path $dl 'make') -Recurse -Filter make.exe | Select-Object -First 1).FullName
  }
}
Say "빌드에 쓸 셸/메이크: $bash / $makeInBash"

# ---------------------------------------------------------------- 3) 소스 준비
Say "Fairy-Stockfish 소스를 준비합니다 ($FsfCommit)"
git clone --branch nnue https://github.com/fairy-stockfish/fairy-stockfish.wasm.git $work 2>&1 | Out-Null
Push-Location $work
git checkout -q $FsfCommit
Pop-Location

# ---------------------------------------------------------------- 4) 단일 스레드화
Say 'Makefile 을 단일 스레드용으로 고칩니다'
# (a) src/emscripten/Makefile — 링크 옵션에서 pthread 제거
#     ASYNCIFY / ASYNCIFY_IMPORTS 는 유지해야 표준입력(getline)이 비동기로 동작한다
$mkEm = Join-Path $work 'src\emscripten\Makefile'
$src = Get-Content $mkEm -Raw
$src = $src -replace '(?m)^\s*-s USE_PTHREADS=1\s*\\?\s*\r?\n', ''
$src = $src -replace '(?m)^\s*-s PROXY_TO_PTHREAD=1\s*\\?\s*\r?\n', ''
# emscripten 4.x+ 는 -s STRICT 모드에서 EXTRA_EXPORTED_RUNTIME_METHODS 를 거부한다
$src = $src -replace '-s EXTRA_EXPORTED_RUNTIME_METHODS=\["FS"\]', '-s EXPORTED_RUNTIME_METHODS=["FS"]'
# emscripten 4.x+ 는 Module 런타임 훅(print/printErr 등)을 기본 차단한다
$src = $src -replace '-s STRICT=1', @"
-s STRICT=1 \
	-s INCOMING_MODULE_JS_API=['print','printErr','setStatus','wasmMemory','wasmBinary','locateFile','arguments','thisProgram','noExitRuntime','onRuntimeInitialized','preRun','postRun','onAbort','quit_','instantiateWasm','monitorRunDependencies'] \
	-s STACK_SIZE=8388608 \
"@ -replace "`r`n","`n"
# 장기(janggi) 변형은 NNUE 를 쓰지 않으므로 신경망(47MB)을 링크하지 않는다
$src = $src.Replace('embedded_nnue = yes', 'embedded_nnue = no')
Set-Content -Path $mkEm -Value $src -NoNewline

# (b) src/Makefile — 컴파일 옵션에서 pthread 와 구버전 clang 전용 플래그 제거
#     -DUSE_PTHREADS, -lpthread : 공유 메모리 요구분
#     -fexperimental-new-pass-manager : clang 16 미만 전용. emcc 가 버전을
#       -dumpversion 으로 알려주지 못해 잘못 붙으므로 제거한다
$mkMain = Join-Path $work 'src\Makefile'
$src = Get-Content $mkMain -Raw
$src = $src -replace '(?m)^\tCXXFLAGS \+= -DUSE_PTHREADS\r?\n', "`t# (removed) CXXFLAGS += -DUSE_PTHREADS`n"
$src = $src -replace '(?m)^\t{4}LDFLAGS \+= -lpthread\r?\n', "`t`t`t`t# (removed) LDFLAGS += -lpthread`n"
$src = $src -replace '(?m)^\t{3}CXXFLAGS \+= -fexperimental-new-pass-manager\r?\n', "`t`t`t# (removed) CXXFLAGS += -fexperimental-new-pass-manager`n"
Set-Content -Path $mkMain -Value $src -NoNewline

# (c) src/thread_win32_osx.h — Emscripten 단일 스레드용 NativeThread 스텁
#     pthread 가 없으므로 std::thread 도 쓸 수 없다(스레드 생성 실패로 죽음).
#     엔진이 메인 스레드에서 직접 탐색하도록 스텁을 넣는다.
$mkThread = Join-Path $work 'src\thread_win32_osx.h'
$src = [System.IO.File]::ReadAllText($mkThread)
$stub = @"
#elif defined(__EMSCRIPTEN__)
// Single-threaded Emscripten build: pthreads are unavailable, so provide a
// stub. ThreadPool::set() only ever asks for one thread and its work is
// driven from the UCI loop on the main thread, so nothing must actually run.
namespace Stockfish {

class NativeThread {

 public:
  template<class T, class P = std::pair<T*, void(T::*)()>>
  explicit NativeThread(void(T::*fun)(), T* obj) {}

  void join() {}
  void detach() {}
};

} // namespace Stockfish

#else // Default case: use STL classes
"@ -replace "`r`n", "`n"
$src = $src.Replace("#else // Default case: use STL classes`n", $stub)
[System.IO.File]::WriteAllText($mkThread, $src, (New-Object System.Text.UTF8Encoding($false)))

# (d) src/thread.cpp — 탐색을 메인 스레드에서 직접 수행
$src = [System.IO.File]::ReadAllText((Join-Path $work 'src\thread.cpp'))
$src = $src.Replace(@"
  exit = true;
  start_searching();
  stdThread.join();
"@ -replace "`r`n","`n", @"
  exit = true;
#ifndef __EMSCRIPTEN__
  start_searching();
  stdThread.join();
#endif
"@ -replace "`r`n","`n")
$src = $src.Replace(@"
  std::unique_lock<std::mutex> lk(mutex);
  cv.wait(lk, [&]{ return !searching; });
"@ -replace "`r`n","`n", @"
#ifndef __EMSCRIPTEN__
  // Single-threaded build: the search runs inline on this very thread, so it
  // is always finished by the time anyone asks.
  std::unique_lock<std::mutex> lk(mutex);
  cv.wait(lk, [&]{ return !searching; });
#endif
"@ -replace "`r`n","`n")
$src = $src.Replace("main()->start_searching();`n}", @"
main()->start_searching();

#ifdef __EMSCRIPTEN__
  // Single-threaded build: there is no idle_loop() thread to wake up, so run
  // the search inline on the calling (main) thread. Thread::search() blocks
  // until the limits are met and prints the bestmove itself.
  main()->search();
#endif
}
"@)
[System.IO.File]::WriteAllText((Join-Path $work 'src\thread.cpp'), $src, (New-Object System.Text.UTF8Encoding($false)))

# (e) src/emscripten/preamble.js — 단일 스레드에서 명령 전달 경로
#     postCustomMessage 가 PThread 로 보내려고 하지만 단일 스레드 빌드에는
#     PThread 가 없어서 아무것도 전달되지 않는다. 입력 큐로 바로 넘긴다.
#     또한 Module.terminate() 도 PThread 를 참조하므로 방어한다.
$pre = Join-Path $work 'src\emscripten\preamble.js'
$src = [System.IO.File]::ReadAllText($pre)
$src = $src.Replace(@'
  if (typeof PThread === 'undefined') return;
'@ -replace "`r`n","`n", @'
  // Single-threaded build (no -s USE_PTHREADS): there is no PThread to post
  // to, so hand the command straight to the input queue.
  if (typeof PThread === 'undefined') {
    Module["onCustomMessage"](data);
    return;
  }
'@ -replace "`r`n","`n")
$src = $src.Replace(@'
  if (typeof PThread === 'undefined') return;
  for (let worker of PThread.runningWorkers) {
'@ -replace "`r`n","`n", @'
  // Single-threaded build (no -s USE_PTHREADS): there is no PThread to post
  // to, so hand the command straight to the input queue.
  if (typeof PThread === 'undefined') {
    Module["onCustomMessage"](data);
    return;
  }
  for (let worker of PThread.runningWorkers) {
'@ -replace "`r`n","`n")
$src = $src.Replace("  PThread.terminateAllThreads();", "  if (typeof PThread !== 'undefined') PThread.terminateAllThreads();")
[System.IO.File]::WriteAllText($pre, $src, (New-Object System.Text.UTF8Encoding($false)))

# ---------------------------------------------------------------- 5) 빌드
Say '빌드합니다 (C++ 전체 컴파일, 수십 분 걸릴 수 있습니다)'
$msys = @"
set -e
export EMSDK='$(cyg $Emsdk)'
export EM_CONFIG="`$EMSDK/.emscripten"
export PATH="`$EMSDK/upstream/emscripten:`$PATH"
cd '$(cyg (Join-Path $work 'src\emscripten'))'
'$(cyg $makeInBash)' -C .. emscripten_build ARCH=wasm -j4
"@ -replace "`r`n", "`n"
$shScript = Join-Path $env:TEMP ('fsf-build-' + [guid]::NewGuid().ToString('N').Substring(0, 6) + '.sh')
Set-Content -Path $shScript -Value $msys -NoNewline
& $bash -lc "bash $(cyg $shScript)"
$rc = $LASTEXITCODE
Remove-Item $shScript -Force -ErrorAction SilentlyContinue
if ($rc -ne 0) { throw "빌드 실패 (exit=$rc). 소스는 $work 에 남겨두었습니다." }

# ---------------------------------------------------------------- 6) 배치
Say "결과물을 $OutDir 에 배치합니다"
New-Item -ItemType Directory -Force $OutDir | Out-Null
Copy-Item (Join-Path $work 'src\stockfish.js')   $OutDir -Force
Copy-Item (Join-Path $work 'src\stockfish.wasm') $OutDir -Force
Write-Host ('  stockfish.js   : {0:N0} B' -f (Get-Item (Join-Path $OutDir 'stockfish.js')).Length)
Write-Host ('  stockfish.wasm : {0:N0} B' -f (Get-Item (Join-Path $OutDir 'stockfish.wasm')).Length)
Write-Host ('  엔진 커밋      : ' + $FsfCommit)

# pthread 빌드라�� stockfish.worker.js 는 더 이상 필요 없다
$worker = Join-Path $OutDir 'stockfish.worker.js'
if (Test-Path $worker) { Remove-Item $worker -Force; Write-Host '  stockfish.worker.js : 삭제 (단일 스레드 빌드라 불필요)' }

# ---------------------------------------------------------------- 7) base64 번들
# file:// 로 열면 fetch() 가 막혀 .wasm 를 읽을 수 없다.
# 엔진·워커 소스를 base64 로 미리 넣어 둔 번들(fsf-bundle.js)을 만들어 스크립트 태그로 읽게 한다.
Say 'base64 번들(fsf-bundle.js)을 생성합니다'
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $repoRoot
try {
    & node (Join-Path $repoRoot 'make-fsf-bundle.js')
    if ($LASTEXITCODE -ne 0) { throw "make-fsf-bundle.js 실패 (exit=$LASTEXITCODE)" }
} finally { Pop-Location }

if (-not $KeepSource) { Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue }
Write-Host '완료.'