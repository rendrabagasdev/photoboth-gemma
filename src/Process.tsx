export default function ProcessPage() {
    return (
        <main className="relative bg-[url('/bg_print.png')] bg-cover bg-center bg-no-repeat w-screen h-screen flex flex-col items-center gap-4 overflow-hidden">

            <img
                src="/bg_fragment.svg"
                alt=""
                className="absolute top-0 left-0 w-full object-cover z-20 scale-[1.124] origin-top"
            />

            <div className="
                absolute
                top-35
                left-1/2
                -translate-x-1/2
                w-100
        h-40
        bg-gradient-to-b
        from-black
        via-black/60
        to-transparent
        blur-xl
        opacity-90
        z-99
        border
        pointer-events-none
    " />


            <img src="image_test.png" className="absolute process_container w-60 top-55 "  ></img>

        </main>
    )
}