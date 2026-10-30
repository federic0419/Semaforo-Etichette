#!/bin/sh
# Compila e firma l'APK. Uso: KS=chiave.keystore KS_PASS=password [KS_ALIAS=semaforo] ./build.sh
set -e
: "${KS:?imposta KS con il percorso della chiave}"
: "${KS_PASS:?imposta KS_PASS con la password della chiave}"
KS_ALIAS="${KS_ALIAS:-semaforo}"
SDK="${ANDROID_SDK:-/usr/lib/android-sdk}"
JAR="$SDK/platforms/android-23/android.jar"
BT="$SDK/build-tools/debian"
cd "$(dirname "$0")"
rm -rf build && mkdir -p build/gen build/obj
aapt package -f -m -J build/gen -M app/AndroidManifest.xml -S app/res -I "$JAR"
javac -nowarn -source 8 -target 8 -bootclasspath "$JAR" -classpath "$JAR" -d build/obj $(find app/src build/gen -name '*.java')
"$BT/dx" --dex --min-sdk-version=21 --output=build/classes.dex build/obj
aapt package -f -M app/AndroidManifest.xml -S app/res -A app/assets -I "$JAR" -F build/app.unsigned.apk -0 wasm -0 onnx
(cd build && aapt add app.unsigned.apk classes.dex >/dev/null)
zipalign -f -p 4 build/app.unsigned.apk build/app.aligned.apk
apksigner sign --min-sdk-version 21 --ks "$KS" --ks-key-alias "$KS_ALIAS" --ks-pass "pass:$KS_PASS" --key-pass "pass:$KS_PASS" --out build/SemaforoEtichette.apk build/app.aligned.apk
apksigner verify build/SemaforoEtichette.apk
echo "Pronto: build/SemaforoEtichette.apk"
