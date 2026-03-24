"use strict";

function $(id)
{
    return document.getElementById(id);
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
    }
    else
    {
        loading.textContent = "Downloading " + e.file_name + " ...";
    }
}

function create_buildroot_settings()
{
    return {
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
}

function init_filesystem_panel(emulator)
{
    $("filesystem_panel").style.display = "block";

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
        }
        catch(err)
        {
            alert("Could not read file: " + path);
            console.error(err);
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
            console.log("✓ Injected /zephyr.exe (" + bytes.length + " bytes) via 9p");
            $("info_filesystem").style.display = "block";
            $("info_filesystem_last_file").textContent = "/zephyr.exe";
            $("info_filesystem_status").textContent = "Auto-injected";
        }
        catch(err)
        {
            console.error("Failed to inject zephyr.exe:", err);
        }
    })();
}

function init_runtime(emulator)
{
    $("loading").style.display = "none";
    $("runtime_options").style.display = "block";
    $("runtime_infos").style.display = "block";
    $("screen_container").style.display = "block";

    init_filesystem_panel(emulator);

    // Note on Phase 4: zephyr.exe is injected via 9p filesystem
    // To execute it, manually type in the terminal:
    //   exec zephyr.exe /proc/sysinfo
    // Auto-send not yet implemented (requires v86 serial API integration)

    $("run").onclick = async function()
    {
        if(emulator.is_running())
        {
            $("run").textContent = "Run";
            await emulator.stop();
        }
        else
        {
            $("run").textContent = "Pause";
            emulator.run();
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
        await emulator.destroy();
        location.reload();
    };

    $("save_state").onclick = async function()
    {
        const state = await emulator.save_state();
        dump_file(state, "v86state.bin");
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
            if(was_running)
            {
                emulator.run();
            }
        }
        catch(err)
        {
            alert("State restore failed. Ensure state matches this VM configuration.");
            console.error(err);
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
        if(timer !== null)
        {
            clearInterval(timer);
        }
        timer = setInterval(update_info, 1000);
    });

    emulator.add_listener("emulator-stopped", function()
    {
        update_info();
        if(timer !== null)
        {
            clearInterval(timer);
            timer = null;
        }
    });

    let fs_read = 0;
    let fs_write = 0;

    emulator.add_listener("9p-read-start", function(args)
    {
        $("info_filesystem").style.display = "block";
        $("info_filesystem_status").textContent = "Loading ...";
        $("info_filesystem_last_file").textContent = args[0];
    });

    emulator.add_listener("9p-read-end", function(args)
    {
        fs_read += args[1];
        $("info_filesystem_bytes_read").textContent = String(fs_read);
        $("info_filesystem_status").textContent = "Idle";
        $("info_filesystem_last_file").textContent = args[0];
    });

    emulator.add_listener("9p-write-end", function(args)
    {
        fs_write += args[1];
        $("info_filesystem_bytes_written").textContent = String(fs_write);
        $("info_filesystem_last_file").textContent = args[0];
        $("info_filesystem_status").textContent = "Idle";
    });
}

function start_buildroot()
{
    $("boot_options").style.display = "none";

    const emulator = new V86(create_buildroot_settings());
    window.emulator = emulator;

    emulator.add_listener("download-progress", show_progress);

    emulator.add_listener("download-error", function(e)
    {
        const loading = $("loading");
        loading.style.display = "block";
        loading.textContent = "Loading failed: " + e.file_name;
    });

    emulator.add_listener("emulator-ready", function()
    {
        // xterm.js is already loaded as a static script in index.html
        emulator.set_serial_container_xtermjs($("terminal"));
        init_runtime(emulator);
    });
}

window.addEventListener("load", function()
{
    $("start_emulation").onclick = function(e)
    {
        e.preventDefault();
        start_buildroot();
        this.blur();
    };

    // Auto-start Buildroot profile
    start_buildroot();
});
