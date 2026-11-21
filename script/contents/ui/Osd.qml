/*
 * Small on-screen message (like KDE's volume or brightness pop-up): "Gaming mode on", "Layout: master", ...
 * Shows on the active screen for 1.5 s. Never takes focus and is never tiled.
 */
import QtQuick
import org.kde.plasma.core as PlasmaCore

PlasmaCore.Dialog {
    id: osd

    property rect screenGeo: Qt.rect(0, 0, 1920, 1080)
    property string text: ""
    property string detail: ""

    type: PlasmaCore.Dialog.OnScreenDisplay
    location: PlasmaCore.Types.Floating
    flags: Qt.WindowDoesNotAcceptFocus | Qt.WindowStaysOnTopHint
    visible: false
    title: "HyprKWin message"

    x: screenGeo.x + (screenGeo.width - box.width) / 2
    y: screenGeo.y + screenGeo.height * 0.72

    function show(message, sub, geo) {
        text = message;
        detail = sub || "";
        screenGeo = geo;
        visible = true;
        hideTimer.restart();
    }

    mainItem: Rectangle {
        id: box
        width: Math.max(title.implicitWidth, sub.implicitWidth) + 64
        height: osd.detail ? 86 : 62
        radius: 12
        color: "#ee1e1e2e"
        border.width: 2
        border.color: "#ff33ccff"

        // inside the content item: a Plasma dialog only accepts visual items as direct children
        Timer {
            id: hideTimer
            interval: 1500
            onTriggered: osd.visible = false
        }

        Column {
            anchors.centerIn: parent
            spacing: 4

            Text {
                id: title
                anchors.horizontalCenter: parent.horizontalCenter
                text: osd.text
                color: "#ffcdd6f4"
                font.pixelSize: 22
                font.bold: true
            }
            Text {
                id: sub
                anchors.horizontalCenter: parent.horizontalCenter
                text: osd.detail
                visible: osd.detail.length > 0
                color: "#ff9399b2"
                font.pixelSize: 13
            }
        }
    }
}
