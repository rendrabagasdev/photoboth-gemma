export default function ProcessPage() {
    return (
        <main className="relative bg-[url('/bg_print.png')] bg-cover bg-center bg-no-repeat w-screen h-screen flex flex-col items-center gap-4 overflow-hidden">

            <img
                src="/bg_fragment.svg"
                alt=""
                className="absolute top-0 left-0 w-full object-cover z-20 scale-[1.124] origin-top"
            />


            <img src="image_test.png" className="absolute process_container w-119 top-55 "  ></img>

        </main>
    )
}