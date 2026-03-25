"use strict";

function $(id)
{
    return document.getElementById(id);
}

const THEME_STORAGE_KEY = "zephyr-v86-theme-mode";
const NETWORK_RELAY_STORAGE_KEY = "zephyr-v86-network-relay";
const DEFAULT_NETWORK_RELAY_URL = "";
const DEFAULT_NETWORK_NIC_TYPE = "ne2k";

function get_system_theme()
{
    if(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches)
    {
        return "dark";
    }
    return "light";
}

function apply_theme_mode(mode)
{
    const resolved = mode === "system" ? get_system_theme() : mode;
    document.documentElement.setAttribute("data-theme", resolved);
}

function init_theme_mode()
{
    const select = $("theme_mode");
    if(!select)
    {
        return;
    }

    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    const mode = stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
    select.value = mode;
    apply_theme_mode(mode);

    select.addEventListener("change", function()
    {
        const next_mode = this.value;
        localStorage.setItem(THEME_STORAGE_KEY, next_mode);
        apply_theme_mode(next_mode);
    });

    if(window.matchMedia)
    {
        const media = window.matchMedia("(prefers-color-scheme: dark)");
        const on_change = function()
        {
            if(select.value === "system")
            {
                apply_theme_mode("system");
            }
        };

        if(media.addEventListener)
        {
            media.addEventListener("change", on_change);
        }
        else if(media.addListener)
        {
            media.addListener(on_change);
        }
    }
}

function get_effective_network_relay_url()
{
    const input = $("network_relay_url");
    if(!input)
    {
        return "";
    }

    return input.value.trim();
}

function set_network_status(text, kind)
{
    const chip = $("network_status");
    if(!chip)
    {
        return;
    }

    chip.textContent = text;
    chip.classList.remove("chip--live", "chip--muted", "chip--error");
    if(kind === "error")
    {
        chip.classList.add("chip--error");
    }
    else if(kind === "live")
    {
        chip.classList.add("chip--live");
    }
    else
    {
        chip.classList.add("chip--muted");
    }
}

function init_network_controls()
{
    const relay_input = $("network_relay_url");
    const relay_active = $("network_relay_active");
    const apply_button = $("network_apply");
    const disable_button = $("network_disable");
    if(!relay_input)
    {
        return;
    }

    const saved = localStorage.getItem(NETWORK_RELAY_STORAGE_KEY);
    const initial = saved === null ? DEFAULT_NETWORK_RELAY_URL : saved;
    relay_input.value = initial;
    if(relay_active)
    {
        relay_active.textContent = initial || "(disabled)";
    }

    set_network_status(initial ? "Configured" : "Disabled", initial ? "live" : "muted");

    relay_input.addEventListener("change", function()
    {
        const value = this.value.trim();
        localStorage.setItem(NETWORK_RELAY_STORAGE_KEY, value);
        if(relay_active)
        {
            relay_active.textContent = value || "(disabled)";
        }
        set_network_status(value ? "Configured" : "Disabled", value ? "live" : "muted");
    });

    if(apply_button)
    {
        apply_button.onclick = function()
        {
            const value = relay_input.value.trim();
            localStorage.setItem(NETWORK_RELAY_STORAGE_KEY, value);
            location.reload();
        };
    }

    if(disable_button)
    {
        disable_button.onclick = function()
        {
            relay_input.value = "";
            localStorage.setItem(NETWORK_RELAY_STORAGE_KEY, "");
            location.reload();
        };
    }
}

function init_serial_accordion()
{
    const toggle = $("toggle_serial");
    const body = $("serial_body");
    if(!toggle || !body)
    {
        return;
    }

    const update = function(expanded)
    {
        body.classList.toggle("is-collapsed", !expanded);
        toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
        toggle.textContent = expanded ? "Hide" : "Show";

        if(expanded)
        {
            // Helps xterm and canvas layouts settle after container expansion.
            requestAnimationFrame(function()
            {
                window.dispatchEvent(new Event("resize"));
            });
        }
    };

    update(false);

    toggle.addEventListener("click", function()
    {
        const is_expanded = toggle.getAttribute("aria-expanded") === "true";
        update(!is_expanded);
    });
}

function set_status(text, kind)
{
    const badge = $("status_badge");
    if(!badge)
    {
        return;
    }

    badge.textContent = text;
    badge.classList.remove("chip--live", "chip--muted", "chip--error");
    if(kind === "error")
    {
        badge.classList.add("chip--error");
    }
    else if(kind === "muted")
    {
        badge.classList.add("chip--muted");
    }
    else
    {
        badge.classList.add("chip--live");
    }
}

function init_utility_tabs()
{
    const tablist = document.querySelector(".tablist");
    const triggers = Array.from(document.querySelectorAll(".tab-trigger"));
    if(!tablist || !triggers.length)
    {
        return {
            markActivity: function() {},
        };
    }

    const activate_tab = function(trigger)
    {
        for(const item of triggers)
        {
            const is_active = item === trigger;
            item.classList.toggle("is-active", is_active);
            item.setAttribute("aria-selected", is_active ? "true" : "false");
            item.tabIndex = is_active ? 0 : -1;

            const panel_id = item.getAttribute("aria-controls");
            const panel = panel_id ? $(panel_id) : null;
            if(panel)
            {
                panel.classList.toggle("is-active", is_active);
                panel.hidden = !is_active;
            }
        }

        trigger.classList.remove("has-activity");
    };

    for(const trigger of triggers)
    {
        trigger.addEventListener("click", function()
        {
            activate_tab(trigger);
        });
    }

    tablist.addEventListener("keydown", function(event)
    {
        const current_index = triggers.indexOf(document.activeElement);
        if(current_index === -1)
        {
            return;
        }

        let next_index = current_index;
        if(event.key === "ArrowRight")
        {
            next_index = (current_index + 1) % triggers.length;
        }
        else if(event.key === "ArrowLeft")
        {
            next_index = (current_index - 1 + triggers.length) % triggers.length;
        }
        else if(event.key === "Home")
        {
            next_index = 0;
        }
        else if(event.key === "End")
        {
            next_index = triggers.length - 1;
        }
        else if(event.key === "Enter" || event.key === " ")
        {
            activate_tab(document.activeElement);
            event.preventDefault();
            return;
        }
        else
        {
            return;
        }

        triggers[next_index].focus();
        event.preventDefault();
    });

    const selected = triggers.find(trigger => trigger.getAttribute("aria-selected") === "true") || triggers[0];
    activate_tab(selected);

    return {
        markActivity: function(tab_name)
        {
            const trigger = $("tab_trigger_" + tab_name);
            if(!trigger || trigger.getAttribute("aria-selected") === "true")
            {
                return;
            }
            trigger.classList.add("has-activity");
        },
    };
}

function format_timestamp(seconds)
{
    if(seconds < 60)
    {
        return seconds + "s";
    }
    if(seconds < 3600)
    {
        const mins = Math.floor(seconds / 60);
        const secs = String(seconds % 60).padStart(2, "0");
        return mins + "m " + secs + "s";
    }
    const hrs = Math.floor(seconds / 3600);
    const mins = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
    const secs = String(seconds % 60).padStart(2, "0");
    return hrs + "h " + mins + "m " + secs + "s";
}

function dump_file(buffer, name)
{
    const blob = new Blob([buffer]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function read_file(file)
{
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

function show_progress(e)
{
    const loading = $("loading");
    loading.style.display = "block";
    if(typeof e.loaded === "number" && typeof e.total === "number" && e.total > 0)
    {
        const pct = Math.max(0, Math.min(100, Math.floor((e.loaded / e.total) * 100)));
        loading.textContent = "Downloading " + e.file_name + " ... " + pct + "%";
        set_status("Downloading " + pct + "%", "muted");
    }
    else
    {
        loading.textContent = "Downloading " + e.file_name + " ...";
        set_status("Downloading assets", "muted");
    }
}

function show_missing_assets_message(missing_required, missing_optional)
{
    const loading = $("loading");
    loading.style.display = "block";

    const lines = ["Cannot start emulator: required VM assets are missing.", ""];

    if(missing_required.length)
    {
        lines.push("Missing required files:");
        for(const file of missing_required)
        {
            lines.push("- " + file);
        }
        lines.push("");
    }

    if(missing_optional.length)
    {
        lines.push("Missing optional files:");
        for(const file of missing_optional)
        {
            lines.push("- " + file);
        }
        lines.push("");
    }

    lines.push("Regenerate assets from repo root:");
    lines.push("  ./tools/build-v86-image.sh --docker --output web");
    lines.push("  west build -d build -b native_sim/native firmware --pristine=auto");
    lines.push("  cp build/zephyr/zephyr.exe web/zephyr.exe");

    loading.textContent = lines.join("\n");
    set_status("Missing required assets", "error");
}

async function probe_asset(url)
{
    try
    {
        const response = await fetch(url, { method: "HEAD", cache: "no-store" });
        return response.ok;
    }
    catch(_err)
    {
        return false;
    }
}

async function preflight_assets()
{
    const required = ["v86-bzimage.bin", "v86-rootfs.cpio.xz"];
    const optional = ["zephyr.exe"];

    const missing_required = [];
    const missing_optional = [];

    for(const file of required)
    {
        if(!(await probe_asset(file)))
        {
            missing_required.push(file);
        }
    }

    for(const file of optional)
    {
        if(!(await probe_asset(file)))
        {
            missing_optional.push(file);
        }
    }

    if(missing_required.length)
    {
        show_missing_assets_message(missing_required, missing_optional);
        return { ok: false, missing_optional };
    }

    if(missing_optional.length)
    {
        console.warn("Missing optional startup assets:", missing_optional.join(", "));
    }

    return { ok: true, missing_optional };
}

function create_buildroot_settings(relay_url)
{
    const settings = {
        wasm_path: "lib/v86.wasm",
        memory_size: 128 * 1024 * 1024,
        vga_memory_size: 8 * 1024 * 1024,
        autostart: true,
        screen_container: $("screen_container"),
        bios: {
            url: "lib/seabios.bin",
        },
        vga_bios: {
            url: "lib/vgabios.bin",
        },
        bzimage: {
            url: "v86-bzimage.bin",
            async: false,
        },
        initrd: {
            url: "v86-rootfs.cpio.xz",
            async: false,
        },
        filesystem: {},
        cmdline: "tsc=reliable mitigations=off random.trust_cpu=on",
    };

    if(relay_url)
    {
        if(relay_url === "fetch" || relay_url.startsWith("fetch://"))
        {
            // fetch backend: HTTP-only networking handled in-browser.
            // No external relay server needed. Supports outbound HTTP
            // via the browser's fetch() API with optional CORS proxy.
            settings.net_device = {
                type: "virtio",
                relay_url: relay_url,
            };
        }
        else
        {
            // wsproxy backend: full ethernet relay via WebSocket.
            // Requires a running relay server (e.g. RootlessRelay).
            settings.net_device = {
                type: DEFAULT_NETWORK_NIC_TYPE,
                relay_url: relay_url,
            };
        }
    }

    return settings;
}

function init_filesystem_panel(emulator)
{
    $("filesystem_panel").style.display = "grid";
    const tab_state = window.ui_tabs || { markActivity: function() {} };

    $("filesystem_send_file").onchange = async function()
    {
        const files = Array.from(this.files || []);
        for(const file of files)
        {
            const bytes = new Uint8Array(await read_file(file));
            await emulator.create_file("/" + file.name, bytes);
            $("info_filesystem").style.display = "block";
            $("info_filesystem_last_file").textContent = "/" + file.name;
            $("info_filesystem_status").textContent = "Uploaded";
            set_status("File uploaded", "muted");
            tab_state.markActivity("files");
        }
        this.value = "";
        this.blur();
    };

    $("filesystem_get_file").onkeypress = async function(e)
    {
        if(e.which !== 13)
        {
            return;
        }

        const path = this.value.trim();
        if(!path)
        {
            return;
        }

        this.disabled = true;
        try
        {
            const result = await emulator.read_file(path);
            const parts = path.replace(/\/$/, "").split("/");
            const filename = parts[parts.length - 1] || "root";
            dump_file(result, filename);
            this.value = "";
            set_status("File downloaded", "muted");
            tab_state.markActivity("files");
        }
        catch(err)
        {
            alert("Could not read file: " + path);
            console.error(err);
            set_status("File read failed", "error");
        }
        finally
        {
            this.disabled = false;
        }
    };

    // Auto-inject zephyr.exe on startup
    (async function inject_zephyr_binary()
    {
        try
        {
            const response = await fetch("zephyr.exe");
            if(!response.ok)
            {
                console.warn("Could not fetch zephyr.exe");
                return;
            }
            const bytes = new Uint8Array(await response.arrayBuffer());
            await emulator.create_file("/zephyr.exe", bytes);
            try
            {
                await emulator.create_file("/mnt/zephyr.exe", bytes);
            }
            catch(mount_err)
            {
                console.warn("Could not mirror /mnt/zephyr.exe:", mount_err);
            }
            console.log("✓ Injected /zephyr.exe (" + bytes.length + " bytes) via 9p");
            $("info_filesystem").style.display = "block";
            $("info_filesystem_last_file").textContent = "/zephyr.exe (mirrored to /mnt when available)";
            $("info_filesystem_status").textContent = "Auto-injected";
            tab_state.markActivity("files");
        }
        catch(err)
        {
            console.error("Failed to inject zephyr.exe:", err);
        }
    })();
}

function init_runtime(emulator, relay_url)
{
    $("loading").style.display = "none";
    $("runtime_options").style.display = "grid";
    $("runtime_infos").style.display = "block";
    $("screen_container").style.display = "block";
    set_status("Running", "live");

    init_filesystem_panel(emulator);

    const relay_active = $("network_relay_active");
    const packets_sent = $("network_packets_sent");
    const packets_received = $("network_packets_received");
    let sent_count = 0;
    let recv_count = 0;

    if(relay_active)
    {
        relay_active.textContent = relay_url || "(disabled)";
    }

    if(relay_url)
    {
        set_network_status("Enabled", "live");
    }
    else
    {
        set_network_status("Disabled", "muted");
    }

    emulator.add_listener("net0-send", function()
    {
        sent_count++;
        if(packets_sent)
        {
            packets_sent.textContent = String(sent_count);
        }
        if(relay_url)
        {
            set_network_status("Traffic", "live");
        }
    });

    emulator.add_listener("net0-receive", function()
    {
        recv_count++;
        if(packets_received)
        {
            packets_received.textContent = String(recv_count);
        }
        if(relay_url)
        {
            set_network_status("Traffic", "live");
        }
    });

    // zephyr.exe is injected via 9p filesystem.
    // Start it manually in the guest shell with:
    //   exec zephyr.exe

    $("run").onclick = async function()
    {
        if(emulator.is_running())
        {
            $("run").textContent = "Run";
            await emulator.stop();
            set_status("Paused", "muted");
        }
        else
        {
            $("run").textContent = "Pause";
            emulator.run();
            set_status("Running", "live");
        }
        this.blur();
    };

    $("reset").onclick = function()
    {
        emulator.restart();
        this.blur();
    };

    $("exit").onclick = async function()
    {
        set_status("Stopped", "muted");
        await emulator.destroy();
        location.reload();
    };

    $("save_state").onclick = async function()
    {
        const state = await emulator.save_state();
        dump_file(state, "v86state.bin");
        set_status("State saved", "muted");
        this.blur();
    };

    $("load_state").onclick = function()
    {
        $("state_input").click();
        this.blur();
    };

    $("state_input").onchange = async function()
    {
        const file = this.files && this.files[0];
        this.value = "";
        if(!file)
        {
            return;
        }

        const was_running = emulator.is_running();
        if(was_running)
        {
            await emulator.stop();
        }

        try
        {
            const state = await read_file(file);
            await emulator.restore_state(state);
            set_status("State restored", "muted");
            if(was_running)
            {
                emulator.run();
                set_status("Running", "live");
            }
        }
        catch(err)
        {
            alert("State restore failed. Ensure state matches this VM configuration.");
            console.error(err);
            set_status("State restore failed", "error");
        }
    };

    let last_tick = Date.now();
    let running_ms = 0;
    let last_instr = 0;
    let total_instr = 0;

    const update_info = function()
    {
        const now = Date.now();
        let instr = emulator.get_instruction_counter();

        if(instr < last_instr)
        {
            last_instr -= 0x100000000;
        }

        const delta_instr = instr - last_instr;
        last_instr = instr;
        total_instr += delta_instr;

        const delta_ms = now - last_tick;
        if(delta_ms > 0)
        {
            running_ms += delta_ms;
            last_tick = now;

            $("speed").textContent = (delta_instr / 1000 / delta_ms).toFixed(1);
            $("avg_speed").textContent = (total_instr / 1000 / running_ms).toFixed(1);
            $("running_time").textContent = format_timestamp(Math.floor(running_ms / 1000));
        }
    };

    let timer = null;
    emulator.add_listener("emulator-started", function()
    {
        last_tick = Date.now();
        set_status("Running", "live");
        if(timer !== null)
        {
            clearInterval(timer);
        }
        timer = setInterval(update_info, 1000);
    });

    emulator.add_listener("emulator-stopped", function()
    {
        update_info();
        set_status("Paused", "muted");
        if(timer !== null)
        {
            clearInterval(timer);
            timer = null;
        }
    });

    let fs_read = 0;
    let fs_write = 0;
    const tab_state = window.ui_tabs || { markActivity: function() {} };

    emulator.add_listener("9p-read-start", function(args)
    {
        $("info_filesystem").style.display = "block";
        $("info_filesystem_status").textContent = "Loading ...";
        $("info_filesystem_last_file").textContent = args[0];
        tab_state.markActivity("files");
    });

    emulator.add_listener("9p-read-end", function(args)
    {
        fs_read += args[1];
        $("info_filesystem_bytes_read").textContent = String(fs_read);
        $("info_filesystem_status").textContent = "Idle";
        $("info_filesystem_last_file").textContent = args[0];
        tab_state.markActivity("files");
    });

    emulator.add_listener("9p-write-end", function(args)
    {
        fs_write += args[1];
        $("info_filesystem_bytes_written").textContent = String(fs_write);
        $("info_filesystem_last_file").textContent = args[0];
        $("info_filesystem_status").textContent = "Idle";
        tab_state.markActivity("files");
    });
}

async function start_buildroot()
{
    set_status("Starting", "muted");
    const relay_url = get_effective_network_relay_url();

    if(relay_url)
    {
        set_network_status("Connecting", "muted");
    }
    else
    {
        set_network_status("Disabled", "muted");
    }

    const preflight = await preflight_assets();
    if(!preflight.ok)
    {
        return;
    }

    $("boot_options").style.display = "none";

    const emulator = new V86(create_buildroot_settings(relay_url));
    window.emulator = emulator;

    emulator.add_listener("download-progress", show_progress);

    emulator.add_listener("download-error", function(e)
    {
        const loading = $("loading");
        loading.style.display = "block";
        loading.textContent = "Loading failed: " + e.file_name;
        set_status("Download failed", "error");
        if(relay_url)
        {
            set_network_status("Relay issue", "error");
        }
    });

    emulator.add_listener("emulator-ready", function()
    {
        // xterm.js is already loaded as a static script in index.html
        emulator.set_serial_container_xtermjs($("terminal"));
        set_status("Ready", "live");
        init_runtime(emulator, relay_url);
    });
}

window.addEventListener("load", function()
{
    init_theme_mode();
    init_serial_accordion();
    init_network_controls();
    window.ui_tabs = init_utility_tabs();

    $("start_emulation").onclick = function(e)
    {
        e.preventDefault();
        start_buildroot();
        this.blur();
    };

    // Auto-start Buildroot profile
    void start_buildroot();
});
