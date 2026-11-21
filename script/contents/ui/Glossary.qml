/*
 * Keybinding glossary — Super+Shift+G. Type to filter, Esc (or Super+Shift+G again) to close.
 * Shows the keys HyprKWin actually uses: its defaults, the hyprland-feel.sh preset's keys,
 * and any key you changed in System Settings (when KDE reports it).
 */
import QtQuick
import QtQuick.Window
import QtQuick.Layouts
import QtQuick.Controls
import org.kde.plasma.core as PlasmaCore

// A Plasma dialog, like KDE's own on-screen pop-ups: a plain Window can't be shown from a KWin script.
PlasmaCore.Dialog {
    id: win

    // [{ group, title, keys, text }]
    property var entries: []
    property int unbound: 0
    property string filter: ""
    property rect screenGeo: Qt.rect(0, 0, 1920, 1080)

    readonly property color bg: "#ee1e1e2e"
    readonly property color panel: "#ff313244"
    readonly property color fg: "#ffcdd6f4"
    readonly property color dim: "#ff9399b2"
    readonly property color accentA: "#ff33ccff"
    readonly property color accentB: "#ff00ff99"

    readonly property real panelW: Math.min(1280, screenGeo.width * 0.9)
    readonly property real panelH: Math.min(860, screenGeo.height * 0.88)

    location: PlasmaCore.Types.Floating
    type: PlasmaCore.Dialog.DialogWindow     // a dialog, so HyprKWin never tiles it
    flags: Qt.WindowStaysOnTopHint
    // close when you click elsewhere, but not in the first moment (focus can bounce while it opens)
    property real openedAt: 0
    onActiveChanged: if (!active && visible && Date.now() - openedAt > 700) visible = false
    visible: false
    title: "HyprKWin keybindings"

    x: screenGeo.x + (screenGeo.width - panelW) / 2
    y: screenGeo.y + (screenGeo.height - panelH) / 2

    function open(list, unboundCount, geo) {
        entries = list;
        unbound = unboundCount;
        screenGeo = geo;
        filter = "";
        search.text = "";
        openedAt = Date.now();
        visible = true;
        raise();
        requestActivate();
        search.forceActiveFocus();
    }

    function toggle(list, unboundCount, geo) {
        if (visible)
            visible = false;
        else
            open(list, unboundCount, geo);
    }

    function matches(e) {
        if (!filter)
            return true;
        const f = filter.toLowerCase();
        return e.text.toLowerCase().indexOf(f) !== -1 || e.keys.join(" ").toLowerCase().indexOf(f) !== -1
            || e.group.toLowerCase().indexOf(f) !== -1;
    }

    function groups() {
        const order = [];
        const byGroup = {};
        for (const e of entries) {
            if (!matches(e))
                continue;
            if (!byGroup[e.group]) {
                byGroup[e.group] = [];
                order.push(e.group);
            }
            byGroup[e.group].push(e);
        }
        return order.map(g => ({ name: g, items: byGroup[g] }));
    }

    mainItem: Rectangle {
        id: panel
        width: win.panelW
        height: win.panelH

        Shortcut {
            sequences: [StandardKey.Cancel]
            onActivated: win.visible = false
        }
        radius: 14
        color: win.bg
        border.width: 2
        border.color: win.accentA

        // Hyprland's default active border is a cyan -> green gradient; draw it as a thin top bar
        Rectangle {
            anchors { left: parent.left; right: parent.right; top: parent.top; margins: 2 }
            height: 3
            radius: 2
            gradient: Gradient {
                orientation: Gradient.Horizontal
                GradientStop { position: 0.0; color: win.accentA }
                GradientStop { position: 1.0; color: win.accentB }
            }
        }

        ColumnLayout {
            anchors.fill: parent
            anchors.margins: 22
            spacing: 14

            RowLayout {
                Layout.fillWidth: true
                spacing: 16

                Text {
                    text: "Keybindings"
                    color: win.fg
                    font.pixelSize: 24
                    font.bold: true
                }
                Text {
                    text: "HyprKWin"
                    color: win.dim
                    font.pixelSize: 14
                    Layout.alignment: Qt.AlignBottom
                    bottomPadding: 3
                }
                Item { Layout.fillWidth: true }

                Rectangle {
                    Layout.preferredWidth: 320
                    Layout.preferredHeight: 36
                    radius: 8
                    color: win.panel
                    border.width: search.activeFocus ? 1 : 0
                    border.color: win.accentA

                    TextInput {
                        id: search
                        anchors.fill: parent
                        anchors.leftMargin: 12
                        anchors.rightMargin: 12
                        verticalAlignment: TextInput.AlignVCenter
                        color: win.fg
                        font.pixelSize: 14
                        clip: true
                        onTextChanged: win.filter = text
                        Keys.onEscapePressed: win.visible = false
                    }
                    Text {
                        anchors.fill: search
                        verticalAlignment: Text.AlignVCenter
                        text: "Type to filter…"
                        color: win.dim
                        font.pixelSize: 14
                        visible: search.text.length === 0
                    }
                }
            }

            Flickable {
                id: flick
                Layout.fillWidth: true
                Layout.fillHeight: true
                clip: true
                contentWidth: width
                contentHeight: flow.implicitHeight
                boundsBehavior: Flickable.StopAtBounds
                ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

                Flow {
                    id: flow
                    width: flick.width
                    spacing: 14

                    Repeater {
                        model: win.visible ? win.groups() : []

                        delegate: Rectangle {
                            required property var modelData
                            width: Math.floor((flow.width - 2 * flow.spacing) / 3)
                            height: col.implicitHeight + 24
                            radius: 10
                            color: win.panel

                            Column {
                                id: col
                                x: 14
                                y: 12
                                width: parent.width - 28
                                spacing: 7

                                Text {
                                    text: modelData.name
                                    color: win.accentA
                                    font.pixelSize: 13
                                    font.bold: true
                                    font.capitalization: Font.AllUppercase
                                    font.letterSpacing: 1
                                    bottomPadding: 3
                                }

                                Repeater {
                                    model: modelData.items

                                    delegate: Item {
                                        required property var modelData
                                        width: col.width
                                        height: Math.max(keysRow.height, label.implicitHeight)

                                        Flow {
                                            id: keysRow
                                            width: Math.min(implicitWidth, col.width * 0.55)
                                            spacing: 4

                                            Repeater {
                                                model: modelData.keys
                                                delegate: Rectangle {
                                                    required property string modelData
                                                    width: keyText.implicitWidth + 12
                                                    height: 22
                                                    radius: 5
                                                    color: "#ff45475a"
                                                    border.width: 1
                                                    border.color: "#ff585b70"
                                                    Text {
                                                        id: keyText
                                                        anchors.centerIn: parent
                                                        text: modelData
                                                        color: win.fg
                                                        font.pixelSize: 12
                                                        font.family: "monospace"
                                                    }
                                                }
                                            }
                                        }

                                        Text {
                                            id: label
                                            anchors.left: keysRow.right
                                            anchors.leftMargin: 10
                                            anchors.right: parent.right
                                            anchors.verticalCenter: keysRow.verticalCenter
                                            text: modelData.text
                                            color: win.fg
                                            font.pixelSize: 13
                                            wrapMode: Text.WordWrap
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            Text {
                Layout.fillWidth: true
                text: (win.unbound > 0 ? win.unbound + " more actions have no key yet. " : "")
                      + "Change keys in System Settings → Keyboard → Shortcuts (search \"HyprKWin\").   Esc to close."
                color: win.dim
                font.pixelSize: 12
                elide: Text.ElideRight
            }
        }
    }
}
