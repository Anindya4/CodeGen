"use client"

import { Button } from "@/components/ui/button"
import { useState } from "react"

export default function DemoPage(){
    const [loading, setLoading] = useState(false)

    const handelBlocking = async () => {
        setLoading(true)
        await fetch("api/demo/blocking", { method: "POST"})
        setLoading(false)
    }


    return (
        <div className="p-8 space-x-4">
            <Button disabled={loading} onClick={handelBlocking}>
                {loading? "Loading..." : "Blocking"}
            </Button>
        </div>
    )
}