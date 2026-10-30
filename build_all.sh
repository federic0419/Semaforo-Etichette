#!/bin/sh
# Costruisce l'APK (da condividere) e l'AAB (per il Play Store), entrambi firmati.
# Uso: KS=chiave.keystore KS_PASS=password [KS_ALIAS=semaforo] ./build_all.sh
set -e
: "${KS:?imposta KS}"; : "${KS_PASS:?imposta KS_PASS}"
KS_ALIAS="${KS_ALIAS:-semaforo}"
SDK="${ANDROID_SDK:-/usr/lib/android-sdk}"
JAR="$SDK/platforms/android-23/android.jar"
BT="$SDK/build-tools/debian"
AAPT2="$BT/aapt2"
cd "$(dirname "$0")"
OUT=build; rm -rf "$OUT"; mkdir -p "$OUT/gen" "$OUT/obj"

# --- codice Java -> classes.dex
aapt package -f -m -J "$OUT/gen" -M app/AndroidManifest.xml -S app/res -I "$JAR"
javac -nowarn -Xlint:-options -source 8 -target 8 -bootclasspath "$JAR" -classpath "$JAR" -d "$OUT/obj" $(find app/src "$OUT/gen" -name '*.java')
"$BT/dx" --dex --min-sdk-version=21 --output="$OUT/classes.dex" "$OUT/obj"

# --- APK
aapt package -f -M app/AndroidManifest.xml -S app/res -A app/assets -I "$JAR" -F "$OUT/app.unsigned.apk" -0 wasm -0 onnx
(cd "$OUT" && aapt add app.unsigned.apk classes.dex >/dev/null)
zipalign -f -p 4 "$OUT/app.unsigned.apk" "$OUT/app.aligned.apk"
apksigner sign --min-sdk-version 21 --ks "$KS" --ks-key-alias "$KS_ALIAS" --ks-pass "pass:$KS_PASS" --key-pass "pass:$KS_PASS" --out "$OUT/SemaforoEtichette.apk" "$OUT/app.aligned.apk"
apksigner verify "$OUT/SemaforoEtichette.apk"

# --- AAB (Android App Bundle): modulo "base" in formato protobuf + BundleConfig.pb
"$AAPT2" compile --dir app/res -o "$OUT/res.zip"
"$AAPT2" link --proto-format -I "$JAR" --manifest app/AndroidManifest.xml -o "$OUT/proto.apk" "$OUT/res.zip" --auto-add-overlay
M="$OUT/aab/base"; mkdir -p "$M/manifest" "$M/dex"
(cd "$M" && unzip -q ../../proto.apk)
mv "$M/AndroidManifest.xml" "$M/manifest/AndroidManifest.xml"
cp "$OUT/classes.dex" "$M/dex/classes.dex"
cp -r app/assets "$M/assets"
# BundleConfig { bundletool { version: "1.18.3" } } codificato a mano (campo 1 -> campo 2 stringa)
python3 -c "import sys; v=b'1.18.3'; inner=b'\x12'+bytes([len(v)])+v; sys.stdout.buffer.write(b'\x0a'+bytes([len(inner)])+inner)" > "$OUT/aab/BundleConfig.pb"
(cd "$OUT/aab" && rm -f ../SemaforoEtichette.aab && zip -q -r -X -D ../SemaforoEtichette.aab BundleConfig.pb base)
jarsigner -sigalg SHA256withRSA -digestalg SHA-256 -keystore "$KS" -storepass "$KS_PASS" -keypass "$KS_PASS" "$OUT/SemaforoEtichette.aab" "$KS_ALIAS" >/dev/null
jarsigner -verify "$OUT/SemaforoEtichette.aab" | tail -1
echo "Pronti: $OUT/SemaforoEtichette.apk e $OUT/SemaforoEtichette.aab"
