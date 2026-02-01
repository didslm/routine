ROOT_DIR := /Users/did/projects/routine
MOBILE_DIR := $(ROOT_DIR)/mobile
APK_OUT_DIR := $(MOBILE_DIR)/android/app/build/outputs/apk/release

VERSION_NAME := $(shell sed -n 's/.*versionName "\([^"]*\)".*/\1/p' $(MOBILE_DIR)/android/app/build.gradle | head -n 1)
VERSION_CODE := $(shell sed -n 's/.*versionCode \([0-9]*\).*/\1/p' $(MOBILE_DIR)/android/app/build.gradle | head -n 1)

APK_ARM64 := app-arm64-v8a-release.apk
APK_ARMV7 := app-armeabi-v7a-release.apk
APK_X86 := app-x86-release.apk
APK_X86_64 := app-x86_64-release.apk

.PHONY: apk apk-copy apk-clean

apk:
	cd $(MOBILE_DIR)/android && ./gradlew assembleRelease

apk-copy: apk
	@mkdir -p $(ROOT_DIR)
	cp -f $(APK_OUT_DIR)/$(APK_ARM64) $(ROOT_DIR)/routine-mobile-arm64.apk
	@echo "Copied release APK to $(ROOT_DIR) (version $(VERSION_NAME), code $(VERSION_CODE))."

apk-clean:
	cd $(MOBILE_DIR)/android && ./gradlew clean
